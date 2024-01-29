type HTTPErrorOptions = {
  res?: Response;
  message?: string;
};

export class HTTPError extends Error {
  readonly res?: Response;
  readonly status: number;
  constructor(status: number = 500, options?: HTTPErrorOptions) {
    super(options?.message);
    this.res = options?.res;
    this.status = status;
  }
  getResponse(): Response {
    if (this.res) {
      return this.res;
    }
    return new Response(this.message, {
      status: this.status,
    });
  }
}

export function errorHandler(err: Error) {
  console.error(err);
  if (err instanceof HTTPError) {
    return err.getResponse();
  }
  return new Response("Internal Server Error", { status: 500 });
}