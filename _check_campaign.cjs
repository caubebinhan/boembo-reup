const fs = require('fs')
const path = require('path')

// Read DB file as buffer
const dbPath = path.join(process.env.APPDATA, 'repost-io', 'repost_io.db')
console.log('DB path:', dbPath)
console.log('DB exists:', fs.existsSync(dbPath))
const stat = fs.statSync(dbPath)
console.log('DB size:', stat.size, 'bytes')

// Read entire file and search for JSON data
const buf = fs.readFileSync(dbPath)
const text = buf.toString('utf-8')

// --- CAMPAIGNS ---
console.log('\n=== SEARCHING FOR CAMPAIGNS ===')
// Campaign data is stored as JSON in data_json column
// Look for campaign names
const campaignNameRegex = /"name"\s*:\s*"([^"]{1,50})"/g
const allNames = new Set()
let m
while ((m = campaignNameRegex.exec(text)) !== null) {
  allNames.add(m[1])
}
console.log('All names found in DB:', [...allNames].join(', '))

// Find "oo" campaign - search for it more specifically
console.log('\n=== CAMPAIGN "oo" VIDEO DATA ===')
// Try to extract complete video arrays near "oo"
const ooIdx = text.indexOf('"name":"oo"')
if (ooIdx === -1) {
  console.log('Could not find "oo" campaign in raw DB')
} else {
  console.log('Found "oo" at byte offset:', ooIdx)
  
  // Find the start of this JSON document by looking backwards for opening brace
  let jsonStart = ooIdx
  let braceCount = 0
  for (let i = ooIdx; i >= 0; i--) {
    if (text[i] === '}') braceCount++
    if (text[i] === '{') {
      if (braceCount === 0) {
        jsonStart = i
        break
      }
      braceCount--
    }
  }
  
  // Find the end by matching braces forward
  braceCount = 0
  let jsonEnd = jsonStart
  for (let i = jsonStart; i < text.length; i++) {
    if (text[i] === '{') braceCount++
    if (text[i] === '}') {
      braceCount--
      if (braceCount === 0) {
        jsonEnd = i + 1
        break
      }
    }
  }
  
  const jsonStr = text.substring(jsonStart, jsonEnd)
  try {
    const data = JSON.parse(jsonStr)
    console.log('Campaign ID:', data.id)
    console.log('Campaign name:', data.name)
    console.log('Campaign status:', data.status)
    
    if (data.videos && Array.isArray(data.videos)) {
      console.log('\n--- Videos (' + data.videos.length + ') ---')
      data.videos.forEach((v, i) => {
        console.log('[' + i + '] pid=' + v.platform_id + ' status=' + v.status + ' url=' + (v.publish_url || '-') + ' sched=' + (v.scheduled_for ? new Date(v.scheduled_for).toLocaleString() : '-'))
      })
      
      // Check for duplicate platform_ids
      const pidCounts = {}
      for (const v of data.videos) {
        const pid = v.platform_id || v.data?.platform_id
        if (pid) pidCounts[pid] = (pidCounts[pid] || 0) + 1
      }
      const dupes = Object.entries(pidCounts).filter(([k, v]) => v > 1)
      if (dupes.length > 0) {
        console.log('\n!!! DUPLICATE PLATFORM_IDS FOUND !!!')
        dupes.forEach(([pid, count]) => console.log('  ' + pid + ': appears ' + count + ' times'))
      } else {
        console.log('\nNo duplicate platform_ids in video batch.')
      }
      
      // Check how many are published
      const statusCounts = {}
      for (const v of data.videos) {
        const s = v.status || 'unknown'
        statusCounts[s] = (statusCounts[s] || 0) + 1
      }
      console.log('\nStatus distribution:', JSON.stringify(statusCounts))
      
      // Find published URLs
      const publishedVids = data.videos.filter(v => v.publish_url)
      if (publishedVids.length > 0) {
        console.log('\n--- Published URLs ---')
        publishedVids.forEach(v => {
          console.log('  pid=' + v.platform_id + ' -> ' + v.publish_url)
        })
        
        // Check for duplicate publish URLs
        const urlCounts = {}
        for (const v of publishedVids) {
          urlCounts[v.publish_url] = (urlCounts[v.publish_url] || 0) + 1
        }
        const urlDupes = Object.entries(urlCounts).filter(([k, v]) => v > 1)
        if (urlDupes.length > 0) {
          console.log('\n!!! DUPLICATE PUBLISH URLs !!!')
          urlDupes.forEach(([url, count]) => console.log('  ' + url + ': ' + count + ' times'))
        }
      }
    }
    
    // Print counters
    if (data.counters) console.log('\nCounters:', JSON.stringify(data.counters))
  } catch (e) {
    console.log('Failed to parse campaign JSON:', e.message)
    console.log('JSON preview (first 500 chars):', jsonStr.substring(0, 500))
  }
}

// --- PUBLISH HISTORY ---
console.log('\n=== PUBLISH HISTORY ENTRIES ===')
// Search for publish_history entries
const phPattern = /"source_platform_id"\s*:\s*"([^"]*)"/g
const phEntries = []
let phMatch
while ((phMatch = phPattern.exec(text)) !== null) {
  const pos = phMatch.index
  // Find enclosing JSON object
  let start = pos
  let braces = 0
  for (let i = pos; i >= Math.max(0, pos - 2000); i--) {
    if (text[i] === '}') braces++
    if (text[i] === '{') {
      if (braces === 0) { start = i; break }
      braces--
    }
  }
  braces = 0
  let end = pos
  for (let i = start; i < Math.min(text.length, pos + 2000); i++) {
    if (text[i] === '{') braces++
    if (text[i] === '}') {
      braces--
      if (braces === 0) { end = i + 1; break }
    }
  }
  try {
    const entry = JSON.parse(text.substring(start, end))
    if (entry.source_platform_id && entry.account_id) {
      phEntries.push(entry)
    }
  } catch {}
}

console.log('Found ' + phEntries.length + ' publish_history entries')
phEntries.forEach((e, i) => {
  console.log('[' + i + '] pid=' + e.source_platform_id + ' account=@' + (e.account_username || '?') + ' status=' + e.status + ' url=' + (e.published_url || '-') + ' campaign=' + (e.campaign_id || '?').substring(0, 8))
})

// Check if same source_platform_id appears multiple times for same account
const phDedupMap = {}
for (const e of phEntries) {
  const key = e.account_id + ':' + e.source_platform_id
  if (!phDedupMap[key]) phDedupMap[key] = []
  phDedupMap[key].push(e)
}
const phDupes = Object.entries(phDedupMap).filter(([k, v]) => v.length > 1)
if (phDupes.length > 0) {
  console.log('\n!!! DUPLICATE PUBLISH HISTORY (same video -> same account) !!!')
  phDupes.forEach(([key, entries]) => {
    console.log('  Key: ' + key + ' (' + entries.length + ' records)')
    entries.forEach(e => {
      console.log('    status=' + e.status + ' url=' + (e.published_url || '-') + ' created=' + new Date(e.created_at).toISOString())
    })
  })
}
