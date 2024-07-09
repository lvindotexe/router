
type PartitionCookieConstraint =
  | { partition: true; secure: true }
  | { partition?: boolean; secure?: boolean } // reset to default
type SecureCookieConstraint = { secure: true }
type HostCookieConstraint = { secure: true; path: '/'; domain?: undefined }

export type CookieOptions = {
  domain?: string
  expires?: Date
  httpOnly?: boolean
  maxAge?: number
  path?: string
  secure?: boolean
  signingSecret?: string
  sameSite?: 'Strict' | 'Lax' | 'None' | 'strict' | 'lax' | 'none'
  partitioned?: boolean
  prefix?: CookiePrefixOptions
} & PartitionCookieConstraint
export type CookiePrefixOptions = 'host' | 'secure'

export type CookieConstraint<Name> = Name extends `__Secure-${string}`
  ? CookieOptions & SecureCookieConstraint
  : Name extends `__Host-${string}`
  ? CookieOptions & HostCookieConstraint
  : CookieOptions

const _serialize = (name: string, value: string, opt: CookieOptions = {}): string => {
  let cookie = `${name}=${value}`

  if (name.startsWith('__Secure-') && !opt.secure) {
    // FIXME: replace link to RFC
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-13#section-4.1.3.1
    throw new Error('__Secure- Cookie must have Secure attributes')
  }

  if (name.startsWith('__Host-')) {
    // FIXME: replace link to RFC
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-13#section-4.1.3.2
    if (!opt.secure) {
      throw new Error('__Host- Cookie must have Secure attributes')
    }

    if (opt.path !== '/') {
      throw new Error('__Host- Cookie must have Path attributes with "/"')
    }

    if (opt.domain) {
      throw new Error('__Host- Cookie must not have Domain attributes')
    }
  }

  if (opt && typeof opt.maxAge === 'number' && opt.maxAge >= 0) {
    if (opt.maxAge > 34560000) {
      // FIXME: replace link to RFC
      // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-13#section-4.1.2.2
      throw new Error(
        'Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration.'
      )
    }
    cookie += `; Max-Age=${Math.floor(opt.maxAge)}`
  }

  if (opt.domain && opt.prefix !== 'host') {
    cookie += `; Domain=${opt.domain}`
  }

  if (opt.path) {
    cookie += `; Path=${opt.path}`
  }

  if (opt.expires) {
    if (opt.expires.getTime() - Date.now() > 34560000_000) {
      // FIXME: replace link to RFC
      // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-13#section-4.1.2.1
      throw new Error(
        'Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future.'
      )
    }
    cookie += `; Expires=${opt.expires.toUTCString()}`
  }

  if (opt.httpOnly) {
    cookie += '; HttpOnly'
  }

  if (opt.secure) {
    cookie += '; Secure'
  }

  if (opt.sameSite) {
    cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`
  }

  if (opt.partitioned) {
    // FIXME: replace link to RFC
    // https://www.ietf.org/archive/id/draft-cutler-httpbis-partitioned-cookies-01.html#section-2.3
    if (!opt.secure) {
      throw new Error('Partitioned Cookie must have Secure attributes')
    }
    cookie += '; Partitioned'
  }

  return cookie
}

export const serialize = <Name extends string>(
  name: Name,
  value: string,
  opt?: CookieConstraint<Name>
): string => {
  value = encodeURIComponent(value)
  return _serialize(name, value, opt)

}

function isObject(item: unknown): item is ObjectType {
  return typeof item === 'object' && item !== null && !Array.isArray(item)
}

export type ObjectType<T = unknown> = {
  [key: string]: T
}


export function deepMerge<T>(target: T, source: Record<string, unknown>): T {
  if (!isObject(target) && !isObject(source)) {
    return source as T
  }
  const merged = { ...target } as ObjectType<T>

  for (const key in source) {
    const value = source[key]
    if (isObject(merged[key]) && isObject(value)) {
      merged[key] = deepMerge(merged[key], value)
    } else {
      merged[key] = value as T[keyof T] & T
    }
  }

  return merged as T
}