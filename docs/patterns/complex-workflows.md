# Complex Workflow Patterns with Embedded Runtime

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

This guide demonstrates how to use Manifest's embedded runtime for complex, multi-step business workflows.

Normative semantics are defined in `docs/spec/semantics.md`.

---

## Core Concept

The **embedded runtime pattern** gives you full control over:

- Command orchestration (multi-step flows)
- Event handling and side effects
- Custom response shapes
- Transaction boundaries
- Error handling and compensation

**When to use:** Complex workflows that cannot be expressed as a single command.

See: `docs/patterns/usage-patterns.md` for decision guidance.

---

## Pattern 1: Multi-Step Order State Machine

Order processing with inventory reservation, payment, and fulfillment.

### Manifest Definition

```manifest
entity Order {
  property required id: string
  property required userId: string
  property required items: array
  property status: string = "pending"
  property totalAmount: number
  property reservationId: string?
  property paymentId: string?

  command place(items: array, totalAmount: number) {
    guard this.status == "pending"
    guard items.length > 0
    guard totalAmount > 0

    mutate this.items = items
    mutate this.totalAmount = totalAmount
    mutate this.status = "placed"
    emit OrderPlaced
  }

  command reserve(reservationId: string) {
    guard this.status == "placed"
    guard reservationId is not empty

    mutate this.reservationId = reservationId
    mutate this.status = "reserved"
    emit InventoryReserved
  }

  command pay(paymentId: string) {
    guard this.status == "reserved"
    guard paymentId is not empty

    mutate this.paymentId = paymentId
    mutate this.status = "paid"
    emit PaymentProcessed
  }

  command fulfill() {
    guard this.status == "paid"

    mutate this.status = "fulfilled"
    emit OrderFulfilled
  }

  command cancel(reason: string) {
    guard this.status in ["placed", "reserved"]

    mutate this.status = "cancelled"
    emit OrderCancelled
  }
}

store Order in postgres
```

### Implementation

```typescript
import { RuntimeEngine } from '@manifest/runtime';
import { PrismaClient } from '@prisma/client';
import { reserveInventory, processPayment, fulfillOrder } from './services';

const prisma = new PrismaClient();

export async function placeOrder(
  userId: string,
  items: Array<{ productId: string; quantity: number }>,
  totalAmount: number
) {
  const runtime = new RuntimeEngine(ir, { userId });

  try {
    // Step 1: Place order
    const placeResult = await runtime.runCommand('Order', 'place', {
      items,
      totalAmount,
    });

    if (!placeResult.success) {
      throw new Error('Order placement failed');
    }

    const orderId = placeResult.instance.id;

    // Step 2: Reserve inventory
    const reservation = await reserveInventory(items);

    const reserveResult = await runtime.runCommand('Order', 'reserve', {
      instanceId: orderId,
      reservationId: reservation.id,
    });

    if (!reserveResult.success) {
      // Compensation: Release reservation
      await releaseReservation(reservation.id);
      throw new Error('Inventory reservation failed');
    }

    // Step 3: Process payment
    const payment = await processPayment(userId, totalAmount);

    const payResult = await runtime.runCommand('Order', 'pay', {
      instanceId: orderId,
      paymentId: payment.id,
    });

    if (!payResult.success) {
      // Compensation: Refund payment, release reservation
      await refundPayment(payment.id);
      await releaseReservation(reservation.id);
      throw new Error('Payment processing failed');
    }

    // Step 4: Queue fulfillment
    await fulfillmentQueue.add('fulfill-order', { orderId });

    return {
      success: true,
      orderId,
      status: 'paid',
    };

  } catch (error) {
    console.error('[Order failed]', error);

    // Cancel order if it was created
    if (placeResult?.instance?.id) {
      await runtime.runCommand('Order', 'cancel', {
        instanceId: placeResult.instance.id,
        reason: error.message,
      });
    }

    return {
      success: false,
      error: error.message,
    };
  }
}
```

---

## Pattern 2: Async Invoice Generation

Generate invoices asynchronously with document rendering and email delivery.

### Manifest Definition

```manifest
entity Invoice {
  property required id: string
  property required userId: string
  property required amount: number
  property status: string = "draft"
  property pdfUrl: string?
  property sentAt: timestamp?

  command generate() {
    guard this.status == "draft"
    guard this.amount > 0

    mutate this.status = "generating"
    emit InvoiceGenerationStarted
  }

  command markGenerated(pdfUrl: string) {
    guard this.status == "generating"
    guard pdfUrl is not empty

    mutate this.pdfUrl = pdfUrl
    mutate this.status = "generated"
    emit InvoiceGenerated
  }

  command send() {
    guard this.status == "generated"
    guard this.pdfUrl is not empty

    mutate this.sentAt = now()
    mutate this.status = "sent"
    emit InvoiceSent
  }
}

store Invoice in postgres
```

### Background Job Worker

```typescript
import { Worker } from 'bullmq';
import { RuntimeEngine } from '@manifest/runtime';
import { generatePDF, uploadToS3, sendEmail } from './services';

const worker = new Worker('invoices', async (job) => {
  const { invoiceId, userId } = job.data;

  const runtime = new RuntimeEngine(ir, { userId });

  try {
    // Start generation
    await runtime.runCommand('Invoice', 'generate', { instanceId: invoiceId });

    // Fetch invoice data
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

    // Generate PDF (long-running)
    const pdfBuffer = await generatePDF(invoice);

    // Upload to S3
    const pdfUrl = await uploadToS3(pdfBuffer, `invoices/${invoiceId}.pdf`);

    // Mark as generated
    await runtime.runCommand('Invoice', 'markGenerated', {
      instanceId: invoiceId,
      pdfUrl,
    });

    // Send email
    await sendEmail(invoice.userEmail, {
      subject: 'Your invoice is ready',
      pdfUrl,
    });

    // Mark as sent
    await runtime.runCommand('Invoice', 'send', { instanceId: invoiceId });

    return { success: true };

  } catch (error) {
    console.error('[Invoice generation failed]', error);
    throw error; // Trigger job retry
  }
});
```

### API Handler

```typescript
export async function POST(request: Request) {
  const { userId } = await auth();
  const { amount } = await request.json();

  const runtime = new RuntimeEngine(ir, { userId });

  // Create draft invoice
  const createResult = await runtime.runCommand('Invoice', 'create', {
    userId,
    amount,
  });

  if (!createResult.success) {
    return Response.json({ error: 'Failed to create invoice' }, { status: 400 });
  }

  const invoiceId = createResult.instance.id;

  // Queue async generation
  await invoiceQueue.add('generate-invoice', { invoiceId, userId });

  return Response.json({
    invoiceId,
    status: 'generating',
    message: 'Invoice generation started',
  });
}
```

---

## Pattern 3: Multi-Step Document Import

Import large files with parsing, validation, and batch processing.

### Manifest Definition

```manifest
entity DocumentImport {
  property required id: string
  property required userId: string
  property required fileUrl: string
  property status: string = "pending"
  property totalRows: number = 0
  property processedRows: number = 0
  property failedRows: number = 0
  property errors: array = []

  command start() {
    guard this.status == "pending"

    mutate this.status = "parsing"
    emit ImportStarted
  }

  command updateProgress(processed: number, failed: number, errors: array) {
    guard this.status == "processing"

    mutate this.processedRows = processed
    mutate this.failedRows = failed
    mutate this.errors = errors
    emit ProgressUpdated
  }

  command complete() {
    guard this.status == "processing"

    mutate this.status = "completed"
    emit ImportCompleted
  }

  command fail(reason: string) {
    mutate this.status = "failed"
    emit ImportFailed
  }
}

store DocumentImport in postgres
```

### Implementation

```typescript
import { RuntimeEngine } from '@manifest/runtime';
import { parseCSV, downloadFile } from './services';
import { Queue } from 'bullmq';

const importQueue = new Queue('imports');

export async function startImport(userId: string, fileUrl: string) {
  const runtime = new RuntimeEngine(ir, { userId });

  // Create import record
  const createResult = await runtime.runCommand('DocumentImport', 'create', {
    userId,
    fileUrl,
  });

  const importId = createResult.instance.id;

  // Queue async processing
  await importQueue.add('process-import', { importId, userId, fileUrl });

  return { importId, status: 'pending' };
}

// Worker
const worker = new Worker('imports', async (job) => {
  const { importId, userId, fileUrl } = job.data;

  const runtime = new RuntimeEngine(ir, { userId });

  try {
    // Start import
    await runtime.runCommand('DocumentImport', 'start', { instanceId: importId });

    // Download and parse file
    const fileBuffer = await downloadFile(fileUrl);
    const rows = await parseCSV(fileBuffer);

    // Update total rows
    await prisma.documentImport.update({
      where: { id: importId },
      data: { totalRows: rows.length, status: 'processing' },
    });

    // Process in batches
    const batchSize = 100;
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      for (const row of batch) {
        try {
          await processRow(row);
          processed++;
        } catch (error) {
          failed++;
          errors.push(`Row ${i}: ${error.message}`);
        }
      }

      // Update progress
      await runtime.runCommand('DocumentImport', 'updateProgress', {
        instanceId: importId,
        processed,
        failed,
        errors,
      });

      // Update job progress
      await job.updateProgress((processed / rows.length) * 100);
    }

    // Complete import
    await runtime.runCommand('DocumentImport', 'complete', { instanceId: importId });

  } catch (error) {
    await runtime.runCommand('DocumentImport', 'fail', {
      instanceId: importId,
      reason: error.message,
    });
    throw error;
  }
});
```

---

## Pattern 4: Saga Pattern with Compensation

Distributed transaction with compensation for failures.

### Manifest Definition

```manifest
entity BookingRequest {
  property required id: string
  property required userId: string
  property required flightId: string
  property required hotelId: string
  property status: string = "pending"
  property flightBookingId: string?
  property hotelBookingId: string?
  property compensated: boolean = false

  command bookFlight(bookingId: string) {
    guard this.status == "pending"

    mutate this.flightBookingId = bookingId
    mutate this.status = "flight_booked"
    emit FlightBooked
  }

  command bookHotel(bookingId: string) {
    guard this.status == "flight_booked"

    mutate this.hotelBookingId = bookingId
    mutate this.status = "completed"
    emit BookingCompleted
  }

  command compensate(reason: string) {
    guard this.compensated == false

    mutate this.compensated = true
    mutate this.status = "cancelled"
    emit CompensationStarted
  }
}

store BookingRequest in postgres
```

### Implementation

```typescript
import { RuntimeEngine } from '@manifest/runtime';
import { bookFlight, cancelFlight, bookHotel, cancelHotel } from './services';

export async function createBooking(
  userId: string,
  flightId: string,
  hotelId: string
) {
  const runtime = new RuntimeEngine(ir, { userId });

  const createResult = await runtime.runCommand('BookingRequest', 'create', {
    userId,
    flightId,
    hotelId,
  });

  const requestId = createResult.instance.id;

  try {
    // Step 1: Book flight
    const flightBooking = await bookFlight(flightId);

    await runtime.runCommand('BookingRequest', 'bookFlight', {
      instanceId: requestId,
      bookingId: flightBooking.id,
    });

    // Step 2: Book hotel
    const hotelBooking = await bookHotel(hotelId);

    await runtime.runCommand('BookingRequest', 'bookHotel', {
      instanceId: requestId,
      bookingId: hotelBooking.id,
    });

    return {
      success: true,
      requestId,
      flightBookingId: flightBooking.id,
      hotelBookingId: hotelBooking.id,
    };

  } catch (error) {
    // Compensation: Cancel any completed bookings
    const request = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
    });

    if (request.flightBookingId) {
      await cancelFlight(request.flightBookingId);
    }

    if (request.hotelBookingId) {
      await cancelHotel(request.hotelBookingId);
    }

    await runtime.runCommand('BookingRequest', 'compensate', {
      instanceId: requestId,
      reason: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}
```

---

## Pattern 5: Event-Driven Workflow Orchestration

Use events to trigger downstream steps.

### Manifest Definition

```manifest
entity RecipeSubmission {
  property required id: string
  property required authorId: string
  property required title: string
  property status: string = "draft"
  property reviewerId: string?
  property publishedAt: timestamp?

  command submit() {
    guard this.status == "draft"

    mutate this.status = "submitted"
    emit RecipeSubmitted
  }

  command assignReviewer(reviewerId: string) {
    guard this.status == "submitted"

    mutate this.reviewerId = reviewerId
    mutate this.status = "in_review"
    emit ReviewerAssigned
  }

  command approve() {
    guard this.status == "in_review"

    mutate this.status = "approved"
    emit RecipeApproved
  }

  command publish() {
    guard this.status == "approved"

    mutate this.publishedAt = now()
    mutate this.status = "published"
    emit RecipePublished
  }
}

store RecipeSubmission in postgres
```

### Implementation

```typescript
import { RuntimeEngine } from '@manifest/runtime';
import { Queue } from 'bullmq';

const reviewQueue = new Queue('reviews');
const publishQueue = new Queue('publishing');

export function setupWorkflow() {
  const runtime = new RuntimeEngine(ir, { userId: 'system' });

  // Step 1: Recipe submitted → assign reviewer
  runtime.onEvent(async (event) => {
    if (event.name === 'RecipeSubmitted') {
      const reviewer = await findAvailableReviewer();

      await runtime.runCommand('RecipeSubmission', 'assignReviewer', {
        instanceId: event.payload.id,
        reviewerId: reviewer.id,
      });
    }
  });

  // Step 2: Reviewer assigned → notify reviewer
  runtime.onEvent(async (event) => {
    if (event.name === 'ReviewerAssigned') {
      await reviewQueue.add('notify-reviewer', {
        reviewerId: event.payload.reviewerId,
        submissionId: event.payload.id,
      });
    }
  });

  // Step 3: Recipe approved → publish
  runtime.onEvent(async (event) => {
    if (event.name === 'RecipeApproved') {
      await runtime.runCommand('RecipeSubmission', 'publish', {
        instanceId: event.payload.id,
      });
    }
  });

  // Step 4: Recipe published → notify author
  runtime.onEvent(async (event) => {
    if (event.name === 'RecipePublished') {
      await publishQueue.add('notify-author', {
        authorId: event.payload.authorId,
        submissionId: event.payload.id,
      });
    }
  });

  return runtime;
}
```

---

## Best Practices

### 1. Use Transactions for Multi-Step Updates

```typescript
await prisma.$transaction(async (tx) => {
  const result = await runtime.runCommand('Order', 'place', input);

  await tx.inventory.updateMany({
    where: { productId: { in: productIds } },
    data: { reserved: { increment: 1 } },
  });
});
```

### 2. Handle Partial Failures with Compensation

```typescript
const completedSteps: string[] = [];

try {
  await step1();
  completedSteps.push('step1');

  await step2();
  completedSteps.push('step2');

  await step3();
  completedSteps.push('step3');

} catch (error) {
  // Compensate in reverse order
  for (const step of completedSteps.reverse()) {
    await compensate(step);
  }

  throw error;
}
```

### 3. Use Idempotency Keys

```typescript
await runtime.runCommand('Order', 'place', {
  ...input,
  idempotencyKey: `order-${userId}-${Date.now()}`,
});
```

### 4. Monitor Long-Running Workflows

```typescript
const workflow = await prisma.workflow.create({
  data: {
    id: workflowId,
    status: 'running',
    steps: ['step1', 'step2', 'step3'],
    currentStep: 'step1',
  },
});

runtime.onEvent((event) => {
  prisma.workflow.update({
    where: { id: workflowId },
    data: { currentStep: event.name },
  });
});
```

### 5. Use Observability

```typescript
import { trace } from '@opentelemetry/api';

const span = trace.getTracer('manifest').startSpan('order.place');

try {
  const result = await runtime.runCommand('Order', 'place', input);
  span.setStatus({ code: 1 });
  return result;
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: 2 });
  throw error;
} finally {
  span.end();
}
```

---

## Related Documentation

- **Spec**: `docs/spec/semantics.md` - Command execution semantics
- **Embedded Runtime**: `docs/patterns/embedded-runtime-pattern.md` - Basic usage
- **Event Wiring**: `docs/patterns/event-wiring.md` - Connecting events to infrastructure
- **Transactional Outbox**: `docs/patterns/transactional-outbox-pattern.md` - Guaranteed event delivery
- **Usage Patterns**: `docs/patterns/usage-patterns.md` - When to use embedded runtime

---

**TL;DR**: Use embedded runtime for complex workflows that require multi-step orchestration, compensation, async processing, or event-driven coordination. Commands define steps, events trigger downstream actions.
