// Mock stub since the real file isn't found
export class TikTokScanner {
  async scanProfile(name: string, opts: any) {
    return { videos: [] }
  }
  async scanKeyword(name: string, opts: any) {
    return { videos: [] }
  }
  async downloadVideo(url: string, id: string, opts: any) {
    return { filePath: `/downloads/${id}.mp4` }
  }
  async publishVideo(filePath: string, caption: string, cookies: any, opts: any) {
    return { success: true, videoUrl: `https://tiktok.com/@test/video/${Date.now()}`, videoId: String(Date.now()) }
  }
}
