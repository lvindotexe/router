# Router
made an end-to-end typesafe router, since i wanted to understand how backend frameworks work. its mostly just a tree and a middleware stack, the typescript was the hardest part


## Usage

### installation
```sh
npm i @lvindotexe/router
```

### runtime usage
```typescript
# Deno
const router = new Router().get("/" (c) => c.text("hello world"))
Deno.serve((req) => router.request(req))

# Node
import {server} from '@lvindotexe/router/node'

const router = new Router().get("/" (c) => c.text("hello world"))
serve(app, (info) => {
  console.log(`Listening on http://localhost:${info.port}`) // Listening on http://localhost:3000
})
```

#### request validation
currently we use zod for request validation
```typescript
const app = new Router()
    .post("/post",(c) => {
            const {name,age} = c.valid('json')
            await db.insert(new User({name,age}))
            return c.text(`${name} inserted`,{status:201}),
        },
        {json:z.object({name:z.string(),age:z.number()})}
    )

```

#### end-to-end typesafety
```typescript
const app = new Router()
    .post("/post",(c) => {
            return c.json(c.valid('json'),{status:201}),
        },
        {json:z.object({name:z.string(),age:z.number()})}
    )

const client = rc<typeof app>("127.0.0.0.1:8000")
const res = await client.post.$post()
const {name,age} = await res.json()
```

#### decorating context
context is passed to every request handler. it can be extended with any proprty

```typescript
const app = new Router()
    .decorate('logger',new Logger())
    .get("/",(c) => {
        c.logger("hello world")
        return c.text("logged")
    })
```

information based on request info can be used to decorate the context 
```typescript
    const app = new Router()
        .state('test',(ctx) => {
            const auth = ctx.headers('authorization')
            return auth.startsWith("Beaerer") ? auth.slice(7) : null
        })
        .get("/",(c) => {
            c.logger("hello world")
            return c.text("logged")
        })
```
