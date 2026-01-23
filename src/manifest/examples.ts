export const examples = [
  {
    name: 'Counter',
    desc: 'Simple reactive counter with constraints',
    code: `// Manifest: A language designed for AI to describe systems
// Instead of implementation, we describe intent

entity Counter {
  property value: number = 0

  behavior on increment {
    mutate value = value + 1
    emit changed
  }

  behavior on decrement when value > 0 {
    mutate value = value - 1
    emit changed
  }

  behavior on reset {
    mutate value = 0
    emit changed
  }

  constraint positive: value >= 0 "Counter cannot be negative"
}

expose Counter as function`
  },
  {
    name: 'User Entity',
    desc: 'User with authentication behaviors',
    code: `entity User {
  property required id: string
  property required email: string
  property name: string = ""
  property passwordHash: string = ""
  property readonly createdAt: string = now()
  property lastLogin: string?
  property active: boolean = true
  property loginAttempts: number = 0

  behavior on login(password) {
    compute validate(password, passwordHash)
    mutate lastLogin = now()
    mutate loginAttempts = 0
    emit loggedIn
  }

  behavior on failedLogin when loginAttempts < 5 {
    mutate loginAttempts = loginAttempts + 1
  }

  behavior on failedLogin when loginAttempts >= 5 {
    mutate active = false
    emit accountLocked
  }

  constraint validEmail: email contains "@" "Invalid email"
  constraint nameLength: name.length >= 2 "Name too short"
}

effect userStorage: storage {
  key: "users"
}

expose User as rest "/api/users" {
  list, get, create, update, delete
}`
  },
  {
    name: 'Data Flow',
    desc: 'Transform data through pipelines',
    code: `// Flows describe data transformations

flow processOrder(Order) -> ProcessedOrder {
  validate: (order) => order.items.length > 0

  map: (order) => {
    subtotal: sum(order.items.map(i => i.price * i.quantity)),
    items: order.items
  }

  transform: {
    subtotal: _value.subtotal,
    tax: _value.subtotal * 0.08,
    total: _value.subtotal * 1.08,
    items: _value.items
  }

  tap: (result) => log("Order processed", result.total)
}

entity Order {
  property required id: string
  property items: list<OrderItem> = []
  property status: string = "pending"

  behavior on submit {
    compute processOrder(self)
    mutate status = "submitted"
    emit orderSubmitted
  }
}

entity OrderItem {
  property required productId: string
  property required price: number
  property quantity: number = 1
}`
  },
  {
    name: 'Todo App',
    desc: 'Complete todo application',
    code: `entity Todo {
  property required id: string
  property required title: string
  property completed: boolean = false
  property createdAt: string = now()
  property completedAt: string?
  property priority: string = "normal"
  property tags: list<string> = []

  behavior on toggle {
    mutate completed = not completed
    mutate completedAt = completed ? now() : null
    emit toggled
  }

  behavior on setPriority(level) {
    mutate priority = level
    emit priorityChanged
  }

  behavior on addTag(tag) when not (tags contains tag) {
    mutate tags = tags.concat([tag])
    emit tagAdded
  }

  constraint titleNotEmpty: title.length > 0 "Title required"
  constraint validPriority: priority in ["low", "normal", "high", "urgent"]
}

entity TodoList {
  property todos: list<Todo> = []
  property filter: string = "all"

  behavior on add(title) {
    compute newTodo = createTodo({ id: uuid(), title: title })
    mutate todos = todos.concat([newTodo])
    emit todoAdded
  }

  behavior on remove(id) {
    mutate todos = todos.filter((t) => t.id != id)
    emit todoRemoved
  }

  behavior on clearCompleted {
    mutate todos = todos.filter((t) => not t.completed)
    emit cleared
  }
}

effect todoStorage: storage {
  key: "todos"
}

expose TodoList as rest "/api/todos"`
  },
  {
    name: 'Composition',
    desc: 'Wire entities into systems',
    code: `// Compositions connect entities together

entity ShoppingCart {
  property items: list<CartItem> = []
  property total: number = 0

  behavior on addItem(product, quantity) {
    compute item = { productId: product.id, price: product.price, quantity: quantity }
    mutate items = items.concat([item])
    mutate total = calculateTotal(items)
    emit itemAdded
  }

  behavior on checkout {
    emit checkoutStarted
  }
}

entity CartItem {
  property required productId: string
  property required price: number
  property quantity: number = 1
}

entity Inventory {
  property products: map<Product>

  behavior on reserve(productId, quantity) {
    compute updateStock(productId, quantity)
    emit reserved
  }
}

entity PaymentProcessor {
  behavior on process(amount, method) {
    effect processPayment(amount, method)
    emit paymentComplete
  }
}

compose CheckoutSystem {
  ShoppingCart as cart
  Inventory as inventory
  PaymentProcessor as payment

  connect cart.checkoutStarted -> inventory.reserve
  connect inventory.reserved -> payment.process
  connect payment.paymentComplete -> cart.clear
}`
  },
  {
    name: 'Effects & APIs',
    desc: 'Side effects and external services',
    code: `// Effects encapsulate side effects

effect weatherAPI: http {
  url: "https://api.weather.example/v1"
  method: "GET"
}

effect analytics: custom {
  provider: "mixpanel"
  token: env("ANALYTICS_TOKEN")
}

effect cache: storage {
  key: "app_cache"
}

effect autoSave: timer {
  interval: 30000
}

entity WeatherDashboard {
  property location: string = ""
  property currentWeather: any?
  property forecast: list<any> = []
  property loading: boolean = false
  property error: string?

  behavior on setLocation(loc) {
    mutate location = loc
    mutate loading = true
    mutate error = null
    emit locationChanged
  }

  behavior on fetchWeather {
    effect weatherAPI.execute({ location: location })
    emit fetchStarted
  }

  behavior on weatherReceived(data) {
    mutate currentWeather = data.current
    mutate forecast = data.forecast
    mutate loading = false
    emit weatherUpdated
  }

  constraint validLocation: location.length > 0 "Location required"
}

expose WeatherDashboard as rest "/api/weather"
expose WeatherDashboard as websocket "/ws/weather"`
  }
];
