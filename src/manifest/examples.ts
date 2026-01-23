export const examples = [
  {
    name: 'Kitchen Module',
    desc: 'Full module with commands, policies, and events',
    code: `// Module: encapsulates related entities and commands
module kitchen {
  entity PrepTask {
    property required id: string
    property required name: string
    property assignedTo: string?
    property status: string = "pending"
    property priority: number = 1

    // Computed property - auto-recalculates
    computed isUrgent: boolean = priority >= 3

    // Relationships
    belongsTo station: Station
    hasMany ingredients: Ingredient

    // Commands - explicit business operations
    command claim(employeeId: string) {
      guard status == "pending"
      guard user.role == "cook" or user.role == "chef"
      mutate assignedTo = employeeId
      mutate status = "in_progress"
      emit taskClaimed
    }

    command complete() {
      guard status == "in_progress"
      guard assignedTo == user.id
      mutate status = "completed"
      emit taskCompleted
    }

    // Policies - auth rules
    policy canView read: true
    policy canClaim execute: user.role in ["cook", "chef"]
    policy canEdit write: user.id == assignedTo or user.role == "chef"

    constraint validStatus: status in ["pending", "in_progress", "completed"]
    constraint validPriority: priority >= 1 and priority <= 5
  }

  entity Station {
    property required id: string
    property required name: string
    property capacity: number = 4
    hasMany tasks: PrepTask
  }

  entity Ingredient {
    property required id: string
    property required name: string
    property quantity: number = 0
    property unit: string = "g"
  }

  // Outbox events for realtime
  event TaskClaimed: "kitchen.task.claimed" {
    taskId: string
    employeeId: string
    stationId: string
  }

  event TaskCompleted: "kitchen.task.completed" {
    taskId: string
    completedBy: string
    duration: number
  }
}

// Persistence
store PrepTask in supabase { table: "prep_tasks" }
store Station in supabase { table: "stations" }

// API with server generation
expose PrepTask as rest server "/api/tasks" {
  list, get, create, update
}`
  },
  {
    name: 'Order with Computed',
    desc: 'Derived properties that auto-update',
    code: `entity OrderItem {
  property required id: string
  property required productId: string
  property required name: string
  property price: number = 0
  property quantity: number = 1
  property discount: number = 0

  // Computed properties - spreadsheet-like
  computed subtotal: number = price * quantity
  computed discountAmount: number = subtotal * (discount / 100)
  computed total: number = subtotal - discountAmount
}

entity Order {
  property required id: string
  property customerId: string?
  property status: string = "draft"
  property taxRate: number = 0.08
  property readonly createdAt: string = now()

  hasMany items: OrderItem

  // These recompute when items change
  computed itemCount: number = items.length
  computed subtotal: number = items.reduce((sum, i) => sum + i.total, 0)
  computed tax: number = subtotal * taxRate
  computed total: number = subtotal + tax

  command addItem(productId: string, name: string, price: number, quantity: number) {
    guard status == "draft"
    compute newItem = { id: uuid(), productId: productId, name: name, price: price, quantity: quantity }
    mutate items = items.concat([newItem])
    emit itemAdded
  }

  command submit() {
    guard status == "draft"
    guard items.length > 0
    mutate status = "submitted"
    emit orderSubmitted
  }

  constraint hasItems: status != "submitted" or items.length > 0 "Order must have items"
}

store Order in localStorage { key: "orders" }
expose Order as function`
  },
  {
    name: 'User with Policies',
    desc: 'Auth and permission rules',
    code: `entity User {
  property required id: string
  property required email: string
  property name: string = ""
  property role: string = "user"
  property teamId: string?
  property active: boolean = true
  property loginAttempts: number = 0
  property readonly createdAt: string = now()

  // Only admins or self can read sensitive data
  policy readBasic read: true
  policy readSensitive read: user.id == self.id or user.role == "admin"

  // Only admins can change roles
  policy canChangeRole write: user.role == "admin" "Only admins can modify users"

  // Self or admin can deactivate
  policy canDeactivate execute: user.id == self.id or user.role == "admin"

  command deactivate() {
    guard active == true
    mutate active = false
    emit userDeactivated
  }

  command changeRole(newRole: string) {
    guard user.role == "admin"
    mutate role = newRole
    emit roleChanged
  }

  constraint validEmail: email contains "@" "Invalid email"
  constraint validRole: role in ["user", "manager", "admin"]
}

entity Team {
  property required id: string
  property required name: string
  property ownerId: string

  hasMany members: User

  policy canView read: user.teamId == self.id or user.role == "admin"
  policy canEdit write: user.id == ownerId or user.role == "admin"
}

store User in supabase { table: "users" }
store Team in supabase { table: "teams" }

expose User as rest server "/api/users" {
  list, get, create, update, delete
}`
  },
  {
    name: 'Realtime Events',
    desc: 'Outbox pattern for pub/sub',
    code: `// Define event types for realtime channels
event OrderCreated: "orders.created" {
  orderId: string
  customerId: string
  total: number
}

event OrderStatusChanged: "orders.status" {
  orderId: string
  oldStatus: string
  newStatus: string
  timestamp: string
}

event InventoryLow: "inventory.alerts" {
  productId: string
  productName: string
  currentStock: number
  threshold: number
}

entity Order {
  property required id: string
  property customerId: string
  property status: string = "pending"
  property total: number = 0

  command create(customerId: string, total: number) {
    mutate customerId = customerId
    mutate total = total
    // Publish to outbox
    publish OrderCreated
    emit created
  }

  command updateStatus(newStatus: string) {
    guard newStatus in ["pending", "processing", "shipped", "delivered"]
    publish OrderStatusChanged
    mutate status = newStatus
    emit statusChanged
  }
}

entity Product {
  property required id: string
  property required name: string
  property stock: number = 0
  property lowStockThreshold: number = 10

  computed isLowStock: boolean = stock <= lowStockThreshold

  command reduceStock(amount: number) {
    guard stock >= amount
    mutate stock = stock - amount
    // Alert when stock is low
    compute checkLowStock()
    emit stockReduced
  }

  behavior on stockReduced when isLowStock {
    publish InventoryLow
  }
}

store Order in supabase
store Product in supabase

expose Order as rest server "/api/orders"
expose Product as rest server "/api/products"`
  },
  {
    name: 'E-commerce System',
    desc: 'Full composition with relationships',
    code: `entity Customer {
  property required id: string
  property required email: string
  property name: string = ""
  property loyaltyPoints: number = 0

  hasMany orders: Order
  hasOne cart: ShoppingCart

  computed totalSpent: number = orders.reduce((sum, o) => sum + o.total, 0)
  computed tier: string = totalSpent > 1000 ? "gold" : totalSpent > 500 ? "silver" : "bronze"

  command addLoyaltyPoints(points: number) {
    mutate loyaltyPoints = loyaltyPoints + points
    emit pointsAdded
  }
}

entity ShoppingCart {
  property required id: string
  property customerId: string

  hasMany items: CartItem
  belongsTo customer: Customer

  computed itemCount: number = items.length
  computed subtotal: number = items.reduce((sum, i) => sum + i.total, 0)

  command addItem(productId: string, price: number, quantity: number) {
    compute item = { id: uuid(), productId: productId, price: price, quantity: quantity }
    mutate items = items.concat([item])
    emit itemAdded
  }

  command checkout() {
    guard items.length > 0
    emit checkoutStarted
  }

  command clear() {
    mutate items = []
    emit cartCleared
  }
}

entity CartItem {
  property required id: string
  property required productId: string
  property price: number = 0
  property quantity: number = 1
  computed total: number = price * quantity

  belongsTo cart: ShoppingCart
  ref product: Product
}

entity Product {
  property required id: string
  property required name: string
  property required price: number
  property stock: number = 0
  property category: string = "general"

  hasMany cartItems: CartItem

  constraint positivePrice: price > 0 "Price must be positive"
  constraint validStock: stock >= 0 "Stock cannot be negative"
}

entity Order {
  property required id: string
  property customerId: string
  property status: string = "pending"
  property total: number = 0

  hasMany items: OrderItem
  belongsTo customer: Customer

  command process() {
    guard status == "pending"
    mutate status = "processing"
    emit orderProcessing
  }

  command ship() {
    guard status == "processing"
    mutate status = "shipped"
    emit orderShipped
  }
}

entity OrderItem {
  property required id: string
  property productId: string
  property quantity: number = 1
  property price: number = 0

  belongsTo order: Order
  ref product: Product

  computed total: number = price * quantity
}

// Persistence configuration
store Customer in supabase
store ShoppingCart in memory
store Product in supabase
store Order in supabase

// Compose the checkout flow
compose CheckoutFlow {
  ShoppingCart as cart
  Order as order
  Customer as customer

  connect cart.checkoutStarted -> order.create
  connect order.orderProcessing -> customer.addLoyaltyPoints
}

expose Customer as rest server "/api/customers"
expose Product as rest server "/api/products"
expose Order as rest server "/api/orders"`
  },
  {
    name: 'Simple Counter',
    desc: 'Basic example with all v2 features',
    code: `// Simple counter showing v2 features

entity Counter {
  property value: number = 0
  property step: number = 1
  property maxValue: number = 100
  property minValue: number = 0

  // Computed - auto updates
  computed percentage: number = (value / maxValue) * 100
  computed isAtMax: boolean = value >= maxValue
  computed isAtMin: boolean = value <= minValue

  // Commands instead of behaviors
  command increment() {
    guard not isAtMax
    mutate value = value + step
    emit incremented
  }

  command decrement() {
    guard not isAtMin
    mutate value = value - step
    emit decremented
  }

  command reset() {
    mutate value = 0
    emit reset
  }

  command setStep(newStep: number) {
    guard newStep > 0
    mutate step = newStep
    emit stepChanged
  }

  // Constraints
  constraint inRange: value >= minValue and value <= maxValue "Value out of range"
  constraint positiveStep: step > 0 "Step must be positive"
}

// Store in browser
store Counter in localStorage { key: "counter" }

// Generate function factory
expose Counter as function`
  }
];
