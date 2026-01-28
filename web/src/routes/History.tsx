import { RenderHistory } from '@/components/RenderHistory'

type Props = {
  token: string
}

export function History({ token }: Props) {
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <RenderHistory token={token} />
    </section>
  )
}
