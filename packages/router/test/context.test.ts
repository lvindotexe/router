import { beforeEach, describe, expect, it,} from 'vitest'
import { _Context } from '../src/router/context'

describe('Context', () => {
  const req = new Request('http://localhost/')

  let c: _Context<any>
  beforeEach(() => {
    c = new _Context(req)
  })

  it('c.text()', async () => {
    const res = c.text('text in c',{
        headers:new Headers({'X-custom':'message'}),
        status:201
    })
    expect(res.status).toBe(201)
    expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/)
    expect(await res.text()).toBe('text in c')
    expect(res.headers.get('X-Custom')).toBe('message')
  })

  it('c.text() with c.status()', async () => {
    const res = c.text('not found',{status:404})
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/)
    expect(await res.text()).toBe('not found')
  })

  it('c.json()', async () => {
    const res = c.json({ message: 'Hello' },{
        status:201,
        headers:new Headers({ 'X-Custom': 'Message' })
    })
    expect(res.status).toBe(201)
    expect(res.headers.get('Content-Type')).toMatch('application/json; charset=UTF-8')
    const text = await res.text()
    expect(text).toBe('{"message":"Hello"}')
    expect(res.headers.get('X-Custom')).toBe('Message')
  })

  it('c.html()', async () => {
    const res: Response = c.html('<h1>Hello! Hono!</h1>',{
        headers:new Headers({ 'X-Custom': 'Message' }),
        status:201
    })
    expect(res.status).toBe(201)
    expect(res.headers.get('Content-Type')).toMatch('text/html')
    expect(await res.text()).toBe('<h1>Hello! Hono!</h1>')
    expect(res.headers.get('X-Custom')).toBe('Message')
  })

//   it('c.html() with async', async () => {
//     const resPromise: Promise<Response> = c.html(
//       new Promise<string>((resolve) => setTimeout(() => resolve('<h1>Hello! Hono!</h1>'), 0)),
//       201,
//       {
//         'X-Custom': 'Message',
//       }
//     )
//     const res = await resPromise
//     expect(res.status).toBe(201)
//     expect(res.headers.get('Content-Type')).toMatch('text/html')
//     expect(await res.text()).toBe('<h1>Hello! Hono!</h1>')
//     expect(res.headers.get('X-Custom')).toBe('Message')
//   })

  it('c.redirect()', async () => {
    let res = c.redirect('/destination')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/destination')
    res = c.redirect('https://example.com/destination')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://example.com/destination')
  })

  it('c.header()', async () => {
    c.header('X-Foo', 'Bar')
    const res = c.text('Hi')
    const foo = res.headers.get('X-Foo')
    expect(foo).toBe('Bar')
  })

  it('c.header() - append', async () => {
    c.header('X-Foo', 'Bar')
    c.header('X-Foo', 'Buzz', { append: true })
    const res = c.text('Hi')
    const foo = res.headers.get('X-Foo')
    expect(foo).toBe('Bar, Buzz')
  })

  it('c.notFound()', async () => {
    const res = c.notFound()
    expect(res).instanceOf(Response)
  })

  it('Should set headers if already this.#headers is created by `c.header()`', async () => {
    c.header('X-Foo', 'Bar')
    c.header('X-Foo', 'Buzz', { append: true })
    const res = c.text('Hi', {
      headers: {
        'X-Message': 'Hi',
      },
    })
    expect(res.headers.get('X-Foo')).toBe('Bar, Buzz')
    expect(res.headers.get('X-Message')).toBe('Hi')
  })

  it('c.header() - append, c.html()', async () => {
    c.header('X-Foo', 'Bar', { append: true })
    const res = c.html('<h1>This rendered fine</h1>')
    expect(res.headers.get('content-type')).toMatch(/^text\/html/)
  })

  it('c.header() - clear the header', async () => {
    c.header('X-Foo', 'Bar')
    c.header('X-Foo', undefined)
    c.header('X-Foo2', 'Bar')
    c.header('X-Foo2', undefined)
    let res = c.text('Hi')
    expect(res.headers.get('X-Foo')).toBe(null)
    expect(res.headers.get('X-Foo2')).toBe(null)
  })

  it('c.header() - clear the header when append is true', async () => {
    c.header('X-Foo', 'Bar', { append: true })
    c.header('X-Foo', undefined)
    let res = c.text('')
    expect(res.headers.get('X-Foo')).toBe(null)
  })

  it('c.text() - multiple header', async () => {
    c.header("X-Foo","Bar")
    c.header("X-Foo","Buzz",{append:true})
    const res = c.text('Hi')
    const foo = res.headers.get('X-Foo')
    expect(foo).toBe('Bar, Buzz')
  })

  it('c.status()', async () => {
    const res = c.text('Hi',{status:201})
    expect(res.status).toBe(201)
  })

  it('Complex pattern', async () => {
    const res = c.json({ hono: 'great app' },{status:404})
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toMatch('application/json; charset=UTF-8')
    const obj: { [key: string]: string } = await res.json()
    expect(obj['hono']).toBe('great app')
  })

  it('Has headers and status', async () => {
    c.header('x-custom1', 'Message1')
    c.header('x-custom2', 'Message2')
    let res = c.text('this is body',{
        status:201,
        headers:new Headers({
      'x-custom3': 'Message3',
      'x-custom2': 'Message2-Override',
    })
    })
    expect(res.headers.get('x-Custom1')).toBe('Message1')
    expect(res.headers.get('x-Custom2')).toBe('Message2-Override')
    expect(res.headers.get('x-Custom3')).toBe('Message3')
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('this is body')

  })

  it('set status to 200 if not specified', async () => {
    const res = c.text('this is body', {
      headers: {
        'x-custom3': 'Message3',
        'x-custom2': 'Message2-Override',
      },
    })
    expect(res.headers.get('x-Custom2')).toBe('Message2-Override')
    expect(res.headers.get('x-Custom3')).toBe('Message3')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('this is body')
  })

  it('Should return 200 response', async () => {
    const res = c.text('Text')
    expect(res.status).toBe(200)
  })

  it('Should return 204 response', async () => {
    const res = c.respond(null,{status:204})
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })



//   it('Should be able read env', async () => {
//     const req = new Request('http://localhost/')
//     const key = 'a-secret-key'
//     const ctx = new Context(req)
//     expect(ctx.env.API_KEY).toBe(key)
//   })

//   it('set and set', async () => {
//     const ctx = new Context(req)
//     expect(ctx.get('k-foo')).toEqual(undefined)
//     ctx.set('k-foo', 'v-foo')
//     expect(ctx.get('k-foo')).toEqual('v-foo')
//     expect(ctx.get('k-bar')).toEqual(undefined)
//     ctx.set('k-bar', { k: 'v' })
//     expect(ctx.get('k-bar')).toEqual({ k: 'v' })
//   })

})