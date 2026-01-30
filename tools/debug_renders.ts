import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const renders = await prisma.render.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { project: true }
  })

  console.log('Latest 5 Renders:')
  for (const r of renders) {
    console.log('------------------------------------------------')
    console.log(`ID: ${r.id}`)
    console.log(`Status: ${r.status}`)
    console.log(`Progress: ${r.progress}%`)
    console.log(`Created: ${r.createdAt.toISOString()}`)
    console.log(`Error: ${r.error || 'none'}`)
    console.log(`LogTail: ${r.logTail ? r.logTail.slice(-200) : 'none'}`)
    console.log(`Project ID: ${r.projectId}`)
    if (r.project) {
        console.log(`Audio URL: ${r.project.audioUrl}`)
        console.log(`Audio Data (len): ${r.project.audioData?.length || 0}`)
        console.log(`Assets count: ${await prisma.asset.count({ where: { projectId: r.projectId } })}`)
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
