import { Cookies } from "./cookie.ts";

type ValidRedirectStatus = 300 | 301 | 302 | 303 | 304 | 307 | 308;

export class Context<D extends Record<string,unknown> = Record<string,unknown>>{
	url:URL
	request:Request
	cookies:Cookies

	constructor(request:Request){
		this.url = new URL(request.url)
		this.request = request,
		this.cookies = new Cookies(request)
	}

	send(value:Record<string,unknown>,options:ResponseInit){
		return new Response(JSON.stringify(value),options)
	}

	redirect(location:string,status:ValidRedirectStatus){
		return new Response(null,{
			status: status || 302,
			headers:{
				location
			}
		})
	}
}
