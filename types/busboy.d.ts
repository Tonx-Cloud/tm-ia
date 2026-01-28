declare module 'busboy' {
  import { IncomingHttpHeaders } from 'http'
  import { Writable } from 'stream'

  interface BusboyConfig {
    headers: IncomingHttpHeaders
    limits?: {
      fileSize?: number
      files?: number
    }
  }

  interface BusboyFileStream {
    resume(): void
    pipe<T extends Writable>(destination: T, options?: { end?: boolean }): T
    on(event: 'data', cb: (chunk: Buffer) => void): this
    on(event: 'end', cb: () => void): this
    on(event: 'error', cb: (err: Error) => void): this
  }

  interface Busboy {
    on(event: 'file', cb: (fieldname: string, file: BusboyFileStream, info: { filename: string; encoding: string; mimeType: string }) => void): this
    on(event: 'finish', cb: () => void): this
    on(event: 'error', cb: (err: Error) => void): this
    end(chunk?: any): void
  }

  function Busboy(config: BusboyConfig): Busboy
  export = Busboy
}
