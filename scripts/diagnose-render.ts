import { prisma } from '../api/_lib/prisma.js'

async function run() {
  console.log('--- DIAGNOSTICAR ÚLTIMOS RENDERS ---')

  const renders = await prisma.render.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { project: true },
  })

  if (renders.length === 0) {
    console.log('Nenhum render encontrado.')
    return
  }

  for (const r of renders) {
    const createdAt = r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)
    console.log(`\nRender ID: ${r.id}`)
    console.log(`Status: ${r.status} • Progress: ${r.progress}`)
    console.log(`Created: ${createdAt}`)
    console.log(`OutputUrl: ${r.outputUrl || '(none)'}`)

    const lt = r.logTail || ''
    const hasHeader = lt.includes('TM-IA render debug')
    const hasAnimLines = lt.includes('scene#')
    console.log(`logTail: len=${lt.length} header=${hasHeader} sceneLines=${hasAnimLines}`)

    console.log('--- PROJETO ---')
    console.log(`Project ID: ${r.projectId}`)
    console.log(`AspectRatio (DB): ${r.project.aspectRatio}`)

    try {
      const sb = JSON.parse(r.project.storyboard)
      console.log(`Storyboard len: ${sb.length}`)
      // Show first 6 scenes
      sb.slice(0, 6).forEach((s: any, i: number) => {
        console.log(
          ` Scene ${i + 1}: anim=${s.animateType || s.animation || (s.animate ? 'zoom-in' : 'none')} dur=${s.durationSec} asset=${s.assetId}`
        )
      })
    } catch {
      console.log('Storyboard inválido (não é JSON)')
    }
  }
}

run()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect())
