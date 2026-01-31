import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'

// Mock Data duplicating the worker logic constants
const RESOLUTIONS = {
  standard: {
    horizontal: { width: 1920, height: 1080 },
  },
}

async function run() {
  console.log('--- TESTE LOCAL DE RENDERIZAÇÃO ---')

  const workDir = path.resolve('temp_test_render')
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir)

  // 1. Create Dummy Image (Red square)
  const imagePath = path.join(workDir, 'frame_000.png')
  // We need a real image. I'll create a tiny BMP manually or use ffmpeg to gen one.
  console.log('Gerando imagem de teste...')
  await new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpegStatic!, [
      '-f', 'lavfi', '-i', 'color=c=red:s=1920x1080', '-frames:v', '1', '-y', imagePath
    ])
    p.on('close', (c) => c === 0 ? resolve() : reject(new Error('Failed to gen image')))
  })

  // 2. Setup Parameters (Simulating 16:9 Pan-Left)
  const duration = 5
  const fps = 30
  const frames = duration * fps
  const res = RESOLUTIONS.standard.horizontal
  const sizeStr = `s=${res.width}x${res.height}`
  const scalePost = `scale=${res.width}:${res.height}`
  
  // Logic from ffmpegWorker.ts
  const filterParts = []
  // Base filters
  const base = `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2:black,scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=${fps}`
  
  // Pan Left Logic (Exact copy from worker)
  // zoompan=z='1.05':x='(iw-ow)*on/${Math.max(1, frames - 1)}':y='(ih-oh)/2':d=${frames}:fps=${fps}:${sizeStr},${scalePost},trim=duration=${duration.toFixed(2)},setpts=PTS-STARTPTS
  const panFilter = `zoompan=z='1.05':x='(iw-ow)*on/${Math.max(1, frames - 1)}':y='(ih-oh)/2':d=${frames}:fps=${fps}:${sizeStr},${scalePost},trim=duration=${duration.toFixed(2)},setpts=PTS-STARTPTS`
  
  const fullFilter = `[0:v]${base},${panFilter}[v0];[v0]concat=n=1:v=1:a=0[vout]`

  const outputFile = path.join(workDir, 'output_test.mp4')
  const args = [
    '-loop', '1', '-t', String(duration), '-i', imagePath,
    '-filter_complex', fullFilter,
    '-map', '[vout]',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-y', outputFile
  ]

  console.log('\n--- COMANDO GERADO ---')
  console.log(`ffmpeg ${args.join(' ')}`)

  // 3. Run FFmpeg
  console.log('\n--- EXECUTANDO FFMPEG ---')
  const proc = spawn(ffmpegStatic!, args)
  
  let stderr = ''
  proc.stderr.on('data', d => stderr += d.toString())

  proc.on('close', async (code) => {
    if (code !== 0) {
      console.error('❌ Falha no render:', code)
      console.error(stderr.slice(-500))
      return
    }
    
    console.log('✅ Render concluído com sucesso!')
    
    // 4. Probe output to check resolution
    console.log('\n--- VERIFICANDO RESOLUÇÃO ---')
    const probe = spawn(ffmpegStatic!, ['-i', outputFile])
    let probeErr = ''
    probe.stderr.on('data', d => probeErr += d.toString())
    probe.on('close', () => {
      const match = probeErr.match(/Stream #0:0.*Video:.* (\d{3,4})x(\d{3,4})/)
      if (match) {
        const w = parseInt(match[1])
        const h = parseInt(match[2])
        console.log(`Resolução detectada: ${w}x${h}`)
        
        if (w === 1920 && h === 1080) {
          console.log('✅ SUCESSO: Resolução correta (16:9). A correção s=WxH funcionou.')
        } else if (w === 128 && h === 128) {
          console.log('❌ FALHA: Vídeo saiu 128x128 (Zoompan default). A correção falhou.')
        } else {
          console.log('⚠️ ALERTA: Resolução inesperada.')
        }
      } else {
        console.log('❌ Não foi possível detectar resolução.')
        console.log(probeErr)
      }
      
      // Cleanup
      // fs.rmSync(workDir, { recursive: true, force: true })
    })
  })
}

run().catch(console.error)
