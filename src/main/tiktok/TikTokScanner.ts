export class TikTokScanner {
  async scanProfile(_name: string, _opts: any) {
    return { videos: [] }
  }
  async scanKeyword(_name: string, _opts: any) {
    return { videos: [] }
  }
  async downloadVideo(_url: string, id: string, _opts: any) {
    return { filePath: `/downloads/${id}.mp4` }
  }
  async publishVideo(_filePath: string, _caption: string, _cookies: any, _opts: any) {
    return { success: true, videoUrl: `https://tiktok.com/@test/video/${Date.now()}`, videoId: String(Date.now()) }
  }
}
