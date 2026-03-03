/**
 * Troubleshooting Error Codes — Unified Registry
 * ────────────────────────────────────────────────
 * Mỗi code là vĩnh viễn: KHÔNG bao giờ tái sử dụng hoặc đổi ý nghĩa.
 * Format: DG-{NNN} (zero-padded).
 *
 * Ranges:
 *   DG-000        Legacy / không phân loại
 *   DG-001..099   Hạ tầng (FFmpeg, DB, mạng, IPC)
 *   DG-100..199   TikTok — publish & verify
 *   DG-200..299   TikTok — quét & nguồn
 *   DG-300..399   Campaign & wizard
 *   DG-400..499   Caption & transform
 *   DG-500..599   Tương thích & khôi phục
 *   DG-600..699   Video editor
 *   DG-700..899   Sentry & troubleshooting
 *   DG-900..999   Debug / meta
 */

export type DiagnosticSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type DiagnosticGroup =
  | 'core'
  | 'core:ffmpeg'
  | 'core:db'
  | 'core:engine'
  | 'core:ipc'
  | 'publish'
  | 'publish:account'
  | 'scan'
  | 'campaign'
  | 'caption'
  | 'compat'
  | 'video-edit'
  | 'recovery'
  | 'sentry'
  | 'async-task'
  | 'meta'

export interface ErrorCodeMeta {
  /** Mã lỗi, ví dụ 'DG-001' */
  code: string
  /** Tiêu đề hiển thị cho user */
  title: string
  /** Nhóm chức năng */
  group: DiagnosticGroup
  /** Mức độ nghiêm trọng */
  severity: DiagnosticSeverity
  /** Gợi ý kỹ thuật (dành cho dev/AI) */
  hint?: string
  /** Nguyên nhân lỗi (hiển thị cho user) */
  cause: string
  /** Danh sách giải pháp (hiển thị cho user, theo thứ tự ưu tiên) */
  solutions: string[]
  /** Icon cho loại lỗi */
  icon: string
  /** User có thể retry không */
  retryable: boolean
  /** User có thể bỏ qua node này không */
  skippable: boolean
  /**
   * ID handler xử lý troubleshooting tự động.
   * Format: 'DG-xxx' → file DG-xxx.handler.ts
   * @see handlers/handler-registry.ts
   */
  troubleshootHandler?: string
}

// ═══════════════════════════════════════════════════════════════
// REGISTRY — Mỗi entry là đầy đủ, không cần merge/override
// ═══════════════════════════════════════════════════════════════

const ERROR_REGISTRY: ErrorCodeMeta[] = [
  // ── Legacy ─────────────────────────────────────────
  { code: 'DG-000', title: 'Lỗi chưa phân loại', group: 'meta', severity: 'medium', hint: 'Legacy run không có error code. Kiểm tra log.', cause: 'Lỗi hệ thống chưa được phân loại.', solutions: ['Kiểm tra log chi tiết', 'Thử chạy lại', 'Liên hệ hỗ trợ'], icon: '⚠️', retryable: true, skippable: true },

  // ═══════════════════════════════════════════════════
  // Hạ tầng (001-099)
  // ═══════════════════════════════════════════════════

  // ── Core infrastructure (001-009) ──────────────────
  { code: 'DG-001', title: 'FFmpeg chưa được cài đặt', group: 'core', severity: 'critical', hint: 'FFmpeg không có trên PATH.', cause: 'Phần mềm xử lý video (FFmpeg) không tìm thấy trên máy tính.', solutions: ['Mở Settings → kiểm tra đường dẫn FFmpeg', 'Tải FFmpeg từ https://ffmpeg.org và cài đặt', 'Khởi động lại ứng dụng sau khi cài'], icon: '🎬', retryable: true, skippable: false, troubleshootHandler: 'DG-001' },
  { code: 'DG-002', title: 'Không kết nối được cơ sở dữ liệu', group: 'core', severity: 'critical', hint: 'File SQLite không mở được.', cause: 'File dữ liệu bị hỏng hoặc ổ đĩa đầy.', solutions: ['Kiểm tra dung lượng ổ đĩa (cần ít nhất 500MB trống)', 'Thử khởi động lại ứng dụng', 'Liên hệ hỗ trợ với mã lỗi DG-002'], icon: '💾', retryable: true, skippable: false, troubleshootHandler: 'DG-002' },
  { code: 'DG-003', title: 'Thư mục lưu video không khả dụng', group: 'core', severity: 'high', hint: 'Thư mục media không tồn tại hoặc read-only.', cause: 'Thư mục lưu video đã bị xóa hoặc không có quyền ghi.', solutions: ['Mở Settings → kiểm tra Media Path', 'Chọn lại thư mục lưu trữ', 'Đảm bảo quyền ghi vào thư mục'], icon: '📂', retryable: true, skippable: false, troubleshootHandler: 'DG-003' },
  { code: 'DG-004', title: 'Không kết nối được Sentry', group: 'core', severity: 'medium', hint: 'Sentry DSN sai hoặc mạng bị chặn.', cause: 'Không thể gửi báo lỗi tự động đến Sentry.', solutions: ['Kiểm tra kết nối mạng', 'Xác nhận DSN trong cấu hình', 'Bỏ qua nếu không dùng Sentry'], icon: '📡', retryable: true, skippable: true },
  { code: 'DG-005', title: 'Không tìm thấy profile trình duyệt', group: 'core', severity: 'high', hint: 'Thư mục profile Chromium bị xóa.', cause: 'Profile trình duyệt đã bị xóa hoặc đường dẫn thay đổi.', solutions: ['Kiểm tra Settings → Browser Profile', 'Tạo profile mới', 'Khởi động lại ứng dụng'], icon: '🗂', retryable: true, skippable: false },
  { code: 'DG-006', title: 'Mất kết nối mạng', group: 'core', severity: 'high', hint: 'DNS/TCP connectivity failure.', cause: 'Không thể kết nối Internet.', solutions: ['Kiểm tra kết nối WiFi/Ethernet', 'Thử tắt/bật lại modem/router', 'Nếu dùng VPN, thử tắt VPN'], icon: '🌐', retryable: true, skippable: false, troubleshootHandler: 'DG-006' },

  // ── FFmpeg (010-029) ──────────────────────────────
  { code: 'DG-010', title: 'Lỗi xử lý video', group: 'core:ffmpeg', severity: 'high', hint: 'FFmpeg trả về exit code != 0.', cause: 'FFmpeg gặp lỗi khi xử lý video. File có thể bị hỏng.', solutions: ['Thử tải lại video từ nguồn', 'Kiểm tra file video gốc', 'Bỏ qua video này'], icon: '🎥', retryable: true, skippable: true, troubleshootHandler: 'DG-010' },
  { code: 'DG-011', title: 'FFprobe thất bại', group: 'core:ffmpeg', severity: 'high', hint: 'ffprobe trả về lỗi hoặc output không parse được.', cause: 'Không đọc được thông tin video. File có thể bị hỏng.', solutions: ['Kiểm tra file video gốc', 'Tải lại video', 'Bỏ qua file này'], icon: '🔎', retryable: true, skippable: true },
  { code: 'DG-012', title: 'FFprobe trả về JSON không hợp lệ', group: 'core:ffmpeg', severity: 'high', hint: 'ffprobe stdout không phải JSON.', cause: 'Phiên bản FFmpeg không tương thích.', solutions: ['Cập nhật FFmpeg lên bản mới nhất', 'Kiểm tra cài đặt FFmpeg'], icon: '📋', retryable: false, skippable: true },
  { code: 'DG-013', title: 'File không có video', group: 'core:ffmpeg', severity: 'medium', hint: 'File không có video stream.', cause: 'File đã tải nhưng không chứa phần video.', solutions: ['Bỏ qua file này', 'Kiểm tra nguồn video gốc'], icon: '🔇', retryable: false, skippable: true },
  { code: 'DG-014', title: 'Thiếu đường dẫn output FFmpeg', group: 'core:ffmpeg', severity: 'high', hint: 'FFmpegCommandBuilder: chưa gọi .output().', cause: 'Lỗi cấu hình xử lý video nội bộ.', solutions: ['Liên hệ hỗ trợ với mã DG-014'], icon: '📁', retryable: false, skippable: true },
  { code: 'DG-015', title: 'Không có file input cho FFmpeg', group: 'core:ffmpeg', severity: 'high', hint: 'FFmpegCommandBuilder: chưa gọi .input().', cause: 'Lỗi cấu hình xử lý video nội bộ.', solutions: ['Liên hệ hỗ trợ với mã DG-015'], icon: '📁', retryable: false, skippable: true },
  { code: 'DG-016', title: 'Không tìm thấy FFmpeg binary', group: 'core:ffmpeg', severity: 'critical', hint: 'FFmpeg binary resolution failed.', cause: 'Không tìm thấy file chạy FFmpeg.', solutions: ['Cài đặt lại FFmpeg', 'Đặt biến FFMPEG_PATH', 'Khởi động lại ứng dụng'], icon: '🎬', retryable: true, skippable: false },
  { code: 'DG-017', title: 'Lỗi trích xuất frame video', group: 'core:ffmpeg', severity: 'high', hint: 'FFmpeg video frame extraction failed.', cause: 'Không trích xuất được frame từ video.', solutions: ['Kiểm tra video có đọc được không', 'Bỏ qua video này'], icon: '🖼', retryable: true, skippable: true },
  { code: 'DG-018', title: 'Lỗi trích xuất audio', group: 'core:ffmpeg', severity: 'high', hint: 'FFmpeg audio extraction failed.', cause: 'Không trích xuất được audio từ file.', solutions: ['Kiểm tra file có audio track không', 'Bỏ qua file này'], icon: '🔊', retryable: true, skippable: true },
  { code: 'DG-019', title: 'Lỗi trích xuất PCM audio', group: 'core:ffmpeg', severity: 'high', hint: 'FFmpeg audio PCM extraction failed.', cause: 'Không chuyển đổi được audio sang PCM.', solutions: ['Kiểm tra codec audio', 'Bỏ qua file này'], icon: '🎵', retryable: true, skippable: true },

  // ── Database (030-039) ────────────────────────────
  { code: 'DG-030', title: 'Không tìm thấy campaign', group: 'core:db', severity: 'high', hint: 'Campaign ID không tồn tại trong DB.', cause: 'Campaign đã bị xóa hoặc không tồn tại.', solutions: ['Kiểm tra lại danh sách campaign', 'Tạo campaign mới'], icon: '🗄', retryable: false, skippable: false },

  // ── FlowEngine (040-049) ──────────────────────────
  { code: 'DG-040', title: 'Không tìm thấy workflow', group: 'core:engine', severity: 'critical', hint: 'Campaign trỏ đến workflow không tồn tại.', cause: 'Workflow đã bị xóa hoặc chưa đăng ký.', solutions: ['Tạo lại campaign với workflow mới', 'Cập nhật ứng dụng'], icon: '🔗', retryable: false, skippable: false },
  { code: 'DG-041', title: 'Không tìm thấy node trong flow', group: 'core:engine', severity: 'critical', hint: 'Node instance không có trong flow graph.', cause: 'Cấu trúc workflow bị hỏng.', solutions: ['Tạo lại campaign', 'Liên hệ hỗ trợ với mã DG-041'], icon: '🧩', retryable: false, skippable: false },
  { code: 'DG-042', title: 'Node chưa được đăng ký', group: 'core:engine', severity: 'critical', hint: 'Node class không có trong NodeRegistry.', cause: 'Module node chưa được tải.', solutions: ['Khởi động lại ứng dụng', 'Cập nhật phiên bản mới'], icon: '🧩', retryable: true, skippable: false },
  { code: 'DG-043', title: 'Workflow không hợp lệ', group: 'core:engine', severity: 'high', hint: 'Flow JSON thiếu required fields.', cause: 'File cấu hình workflow bị lỗi.', solutions: ['Kiểm tra file flow.yaml', 'Liên hệ hỗ trợ'], icon: '📄', retryable: false, skippable: false },

  // ── IPC validation (050-059) ──────────────────────
  { code: 'DG-050', title: 'Thiếu tham số runId', group: 'core:ipc', severity: 'medium', hint: 'IPC request thiếu runId.', cause: 'Lỗi giao tiếp nội bộ giữa giao diện và engine.', solutions: ['Thử lại thao tác', 'Khởi động lại ứng dụng'], icon: '🔌', retryable: true, skippable: true },
  { code: 'DG-051', title: 'Thiếu tham số caseId', group: 'core:ipc', severity: 'medium', hint: 'IPC request thiếu caseId.', cause: 'Lỗi giao tiếp nội bộ.', solutions: ['Thử lại thao tác', 'Khởi động lại ứng dụng'], icon: '🔌', retryable: true, skippable: true },
  { code: 'DG-052', title: 'Dữ liệu task không hợp lệ', group: 'core:ipc', severity: 'medium', hint: 'IPC enqueue payload thiếu fields.', cause: 'Dữ liệu gửi đến hệ thống không đầy đủ.', solutions: ['Thử lại thao tác', 'Khởi động lại ứng dụng'], icon: '🔌', retryable: true, skippable: true },
  { code: 'DG-053', title: 'Thiếu mã xử lý lỗi', group: 'core:ipc', severity: 'medium', hint: 'IPC request thiếu handlerId.', cause: 'Lỗi giao tiếp nội bộ — thiếu thông tin để chạy kiểm tra.', solutions: ['Thử lại thao tác', 'Khởi động lại ứng dụng'], icon: '🔌', retryable: true, skippable: true },

  // ═══════════════════════════════════════════════════
  // Publish & verify (100-199)
  // ═══════════════════════════════════════════════════
  { code: 'DG-100', title: 'TikTok yêu cầu đăng nhập lại', group: 'publish', severity: 'critical', hint: 'TikTok Studio redirect đến login.', cause: 'Phiên đăng nhập TikTok đã hết hạn.', solutions: ['Mở Settings → Accounts', 'Xóa tài khoản cũ và thêm lại', 'Đăng nhập lại và chờ cookie mới'], icon: '🔑', retryable: true, skippable: false, troubleshootHandler: 'DG-100' },
  { code: 'DG-101', title: 'TikTok hiện CAPTCHA', group: 'publish', severity: 'high', hint: 'CAPTCHA xuất hiện trên trang upload.', cause: 'TikTok phát hiện hoạt động bất thường và yêu cầu CAPTCHA.', solutions: ['Bấm "Giải CAPTCHA" trên video card', 'Tăng khoảng cách publish (interval)', 'Đợi 30 phút rồi thử lại'], icon: '🧩', retryable: true, skippable: true, troubleshootHandler: 'DG-101' },
  { code: 'DG-102', title: 'Giao diện TikTok đã thay đổi', group: 'publish', severity: 'high', hint: 'DOM selectors không tìm thấy.', cause: 'TikTok cập nhật website, phần mềm không tìm thấy nút bấm.', solutions: ['Cập nhật ứng dụng lên phiên bản mới nhất', 'Liên hệ hỗ trợ với mã DG-102'], icon: '🔄', retryable: false, skippable: true },
  { code: 'DG-103', title: 'Upload video quá lâu', group: 'publish', severity: 'high', hint: 'Publish timeout.', cause: 'Upload mất quá nhiều thời gian. Mạng chậm hoặc file quá lớn.', solutions: ['Kiểm tra tốc độ mạng', 'Giảm chất lượng video', 'Bấm Retry'], icon: '⏱', retryable: true, skippable: true, troubleshootHandler: 'DG-103' },
  { code: 'DG-104', title: 'Video đang chờ duyệt', group: 'publish', severity: 'medium', hint: 'TikTok trả về under_review.', cause: 'Video đã gửi nhưng đang chờ TikTok duyệt.', solutions: ['Đợi TikTok duyệt (thường 24h)', 'Kiểm tra lại sau'], icon: '⏳', retryable: false, skippable: true },
  { code: 'DG-105', title: 'Lỗi kiểm tra sau publish', group: 'publish', severity: 'medium', hint: 'Dashboard recheck crashed.', cause: 'Kiểm tra sau khi publish bị lỗi.', solutions: ['Kiểm tra thủ công trên TikTok', 'Bỏ qua bước này'], icon: '🔁', retryable: true, skippable: true },
  { code: 'DG-106', title: 'Publish crash không xác định', group: 'publish', severity: 'critical', hint: 'Unhandled exception trong publish flow.', cause: 'Lỗi nghiêm trọng không xác định khi publish.', solutions: ['Kiểm tra log chi tiết', 'Thử lại', 'Liên hệ hỗ trợ với mã DG-106'], icon: '💥', retryable: true, skippable: false },

  // ── Publisher (110-129) ───────────────────────────
  { code: 'DG-110', title: 'Trình duyệt không phản hồi', group: 'publish', severity: 'critical', hint: 'Playwright không tạo được page.', cause: 'Trình duyệt tích hợp gặp lỗi, có thể thiếu RAM.', solutions: ['Đóng ứng dụng khác để giải phóng RAM', 'Khởi động lại ứng dụng', 'Kiểm tra Settings → Automation Browser'], icon: '🖥', retryable: true, skippable: false, troubleshootHandler: 'DG-110' },
  { code: 'DG-111', title: 'Trình duyệt đóng giữa chừng', group: 'publish', severity: 'critical', hint: 'Browser page closed unexpectedly.', cause: 'Trình duyệt bị crash giữa quá trình publish.', solutions: ['Kiểm tra RAM hệ thống', 'Khởi động lại ứng dụng', 'Giảm số campaign chạy song song'], icon: '🖥', retryable: true, skippable: false },
  { code: 'DG-112', title: 'Không tìm thấy nút Đăng', group: 'publish', severity: 'high', hint: 'Post/Submit button selector drift.', cause: 'Giao diện TikTok thay đổi, không tìm thấy nút Đăng.', solutions: ['Cập nhật ứng dụng', 'Liên hệ hỗ trợ'], icon: '🖱', retryable: false, skippable: true },
  { code: 'DG-113', title: 'CAPTCHA khi upload file', group: 'publish', severity: 'high', hint: 'CAPTCHA xuất hiện khi upload.', cause: 'TikTok yêu cầu CAPTCHA trong quá trình upload.', solutions: ['Bấm "Giải CAPTCHA"', 'Tăng interval', 'Thử tài khoản khác'], icon: '🧩', retryable: true, skippable: true, troubleshootHandler: 'DG-113' },
  { code: 'DG-114', title: 'Video vi phạm chính sách TikTok', group: 'publish', severity: 'high', hint: 'Content bị flag bởi TikTok.', cause: 'TikTok phát hiện nội dung vi phạm quy tắc.', solutions: ['Bỏ qua video này', 'Kiểm tra nội dung video', 'Cắt phần vi phạm rồi publish lại'], icon: '⛔', retryable: false, skippable: true },
  { code: 'DG-115', title: 'Upload file thất bại', group: 'publish', severity: 'high', hint: 'File upload exhausted all retries.', cause: 'Không thể tải video lên TikTok sau nhiều lần thử.', solutions: ['Kiểm tra kết nối Internet', 'Đảm bảo file < 500MB', 'Thử Retry'], icon: '📤', retryable: true, skippable: true, troubleshootHandler: 'DG-115' },
  { code: 'DG-116', title: 'Không tìm thấy ô chọn file', group: 'publish', severity: 'high', hint: 'File input element không có trên page.', cause: 'Giao diện TikTok thay đổi, không tìm thấy ô upload.', solutions: ['Cập nhật ứng dụng', 'Liên hệ hỗ trợ'], icon: '📎', retryable: false, skippable: true },
  { code: 'DG-117', title: 'Trình duyệt đóng khi kiểm tra', group: 'publish', severity: 'high', hint: 'Page closed during verification.', cause: 'Trình duyệt bị crash khi kiểm tra video đã đăng.', solutions: ['Kiểm tra thủ công trên TikTok', 'Khởi động lại ứng dụng'], icon: '🖥', retryable: true, skippable: true },
  { code: 'DG-118', title: 'Không mở được trang kiểm tra', group: 'publish', severity: 'high', hint: 'Recheck page create failed.', cause: 'Không mở được trình duyệt để kiểm tra lại.', solutions: ['Khởi động lại ứng dụng', 'Kiểm tra thủ công'], icon: '🖥', retryable: true, skippable: true },

  // ── Account (130-139) ─────────────────────────────
  { code: 'DG-130', title: 'Tài khoản không tồn tại', group: 'publish:account', severity: 'high', hint: 'Account ID không có trong DB.', cause: 'Tài khoản TikTok đã bị xóa hoặc không tìm thấy.', solutions: ['Mở Settings → Accounts', 'Thêm lại tài khoản TikTok'], icon: '👤', retryable: false, skippable: false },
  { code: 'DG-131', title: 'Phiên đăng nhập hết hạn', group: 'publish:account', severity: 'critical', hint: 'Session cookies expired.', cause: 'Cookie đăng nhập TikTok đã hết hạn.', solutions: ['Mở Settings → Accounts → đăng nhập lại', 'Kiểm tra từng tài khoản'], icon: '🔐', retryable: true, skippable: false, troubleshootHandler: 'DG-131' },
  { code: 'DG-132', title: 'Chưa cấu hình tài khoản publish', group: 'publish:account', severity: 'high', hint: 'Campaign không có account.', cause: 'Chiến dịch chưa có tài khoản TikTok.', solutions: ['Mở Settings → Accounts → thêm tài khoản', 'Chỉnh sửa chiến dịch để chọn tài khoản'], icon: '👥', retryable: false, skippable: false },

  // ═══════════════════════════════════════════════════
  // Quét & nguồn (200-299)
  // ═══════════════════════════════════════════════════
  { code: 'DG-200', title: 'Không tìm thấy video nào', group: 'scan', severity: 'medium', hint: 'Scanner trả về 0 kết quả.', cause: 'Quét nguồn nhưng không có kết quả.', solutions: ['Kiểm tra URL/tên kênh nguồn', 'Giảm bộ lọc (minLikes, minViews)', 'Đảm bảo kênh có video công khai'], icon: '🔍', retryable: true, skippable: true, troubleshootHandler: 'DG-200' },
  { code: 'DG-201', title: 'Bộ lọc quá chặt', group: 'scan', severity: 'medium', hint: 'Filter loại bỏ hết candidate.', cause: 'Bộ lọc (minViews, minLikes) loại bỏ tất cả video.', solutions: ['Giảm ngưỡng bộ lọc', 'Kiểm tra cài đặt withinDays'], icon: '🔧', retryable: true, skippable: true },
  { code: 'DG-202', title: 'Kênh nguồn không tồn tại', group: 'scan', severity: 'high', hint: 'Channel URL/handle không resolve được.', cause: 'Không tìm thấy kênh TikTok đã nhập.', solutions: ['Kiểm tra lại tên kênh/URL', 'Tìm kênh trên TikTok bằng tay', 'Thay kênh nguồn khác'], icon: '📺', retryable: false, skippable: true, troubleshootHandler: 'DG-202' },
  { code: 'DG-203', title: 'Không kết nối được đến nguồn', group: 'scan', severity: 'high', hint: 'HTTP error khi fetch source page.', cause: 'Lỗi mạng khi truy cập trang nguồn.', solutions: ['Kiểm tra kết nối Internet', 'Thử lại sau vài phút', 'Thử đổi VPN server'], icon: '🌐', retryable: true, skippable: true, troubleshootHandler: 'DG-203' },
  { code: 'DG-204', title: 'Kết quả quét bị thiếu', group: 'scan', severity: 'low', hint: 'Pagination bị gaps.', cause: 'Quá trình quét bị mất một số kết quả do phân trang.', solutions: ['Quét lại', 'Bỏ qua'], icon: '📊', retryable: true, skippable: true },
  { code: 'DG-210', title: 'Không tải được video', group: 'scan', severity: 'high', hint: 'Download URL extraction failed.', cause: 'Không thể lấy link download từ TikTok.', solutions: ['Bỏ qua video này', 'Thử lại sau vài phút', 'Cập nhật ứng dụng'], icon: '⬇️', retryable: true, skippable: true, troubleshootHandler: 'DG-210' },
  { code: 'DG-211', title: 'Lỗi HTTP khi tải video', group: 'scan', severity: 'high', hint: 'Download HTTP trả về non-200.', cause: 'CDN TikTok từ chối tải. Có thể do IP bị chặn.', solutions: ['Thử đổi VPN', 'Đợi vài phút', 'Bỏ qua video này'], icon: '⬇️', retryable: true, skippable: true },
  { code: 'DG-212', title: 'File tải về quá nhỏ', group: 'scan', severity: 'medium', hint: 'File < 50KB, có thể là error page.', cause: 'File tải về không phải video (quá nhỏ).', solutions: ['Bỏ qua file này', 'Thử tải lại'], icon: '📦', retryable: true, skippable: true },

  // ═══════════════════════════════════════════════════
  // Campaign & wizard (300-399)
  // ═══════════════════════════════════════════════════
  { code: 'DG-300', title: 'Tạo campaign thất bại', group: 'campaign', severity: 'high', hint: 'Campaign document write failed.', cause: 'Không thể tạo campaign mới.', solutions: ['Kiểm tra dung lượng ổ đĩa', 'Thử lại', 'Khởi động lại ứng dụng'], icon: '📝', retryable: true, skippable: false },
  { code: 'DG-301', title: 'Chi tiết campaign trống', group: 'campaign', severity: 'medium', hint: 'Campaign detail nhận null data.', cause: 'Không tải được thông tin campaign.', solutions: ['Quay lại danh sách và vào lại', 'Khởi động lại ứng dụng'], icon: '📋', retryable: true, skippable: true },
  { code: 'DG-302', title: 'Wizard: nguồn không hợp lệ', group: 'campaign', severity: 'medium', hint: 'Sources validation rejected.', cause: 'Thông tin nguồn video chưa đúng.', solutions: ['Kiểm tra URL đã nhập', 'Thử nhập lại'], icon: '📝', retryable: true, skippable: false },
  { code: 'DG-303', title: 'Lỗi lên lịch hàng loạt', group: 'campaign', severity: 'high', hint: 'Bulk reschedule computation failed.', cause: 'Không thể tính toán lại lịch phát.', solutions: ['Kiểm tra cấu hình thời gian', 'Thử lại'], icon: '📅', retryable: true, skippable: true },

  // ═══════════════════════════════════════════════════
  // Caption & transform (400-499)
  // ═══════════════════════════════════════════════════
  { code: 'DG-400', title: 'Caption rỗng sau xử lý', group: 'caption', severity: 'medium', hint: 'Transform chain output rỗng.', cause: 'Quy tắc chuyển đổi caption cho kết quả rỗng.', solutions: ['Kiểm tra template caption', 'Bỏ bớt rule lọc'], icon: '📝', retryable: true, skippable: true },
  { code: 'DG-401', title: 'Caption dùng giá trị mặc định', group: 'caption', severity: 'low', hint: 'Caption chính rỗng, dùng fallback.', cause: 'Caption gốc trống, đã dùng giá trị mặc định.', solutions: ['Kiểm tra nguồn caption', 'Cập nhật template'], icon: '📝', retryable: false, skippable: true },
  { code: 'DG-402', title: 'Caption bị lỗi encoding', group: 'caption', severity: 'medium', hint: 'Unicode/emoji/hashtag bị hỏng.', cause: 'Ký tự đặc biệt hoặc hashtag bị lỗi encoding.', solutions: ['Kiểm tra caption gốc', 'Bỏ ký tự đặc biệt'], icon: '🔤', retryable: true, skippable: true },
  { code: 'DG-403', title: 'Lỗi pipeline caption', group: 'caption', severity: 'medium', hint: 'Transform chain trả shape lạ.', cause: 'Lỗi xử lý caption nội bộ.', solutions: ['Thử template đơn giản hơn', 'Liên hệ hỗ trợ'], icon: '🔧', retryable: true, skippable: true },
  { code: 'DG-404', title: 'Lỗi điều kiện skip caption', group: 'caption', severity: 'low', hint: 'Condition-based skip behaved inconsistently.', cause: 'Quy tắc bỏ qua caption hoạt động không đúng.', solutions: ['Kiểm tra lại điều kiện lọc', 'Bỏ qua'], icon: '⚙️', retryable: true, skippable: true },

  // ═══════════════════════════════════════════════════
  // Tương thích & khôi phục (500-599)
  // ═══════════════════════════════════════════════════
  { code: 'DG-500', title: 'Kiểm tra tương thích thất bại', group: 'compat', severity: 'medium', hint: 'System compat check failed.', cause: 'Hệ thống phát hiện vấn đề tương thích.', solutions: ['Kiểm tra cấu hình hệ thống', 'Cập nhật ứng dụng'], icon: '🔧', retryable: true, skippable: true },
  { code: 'DG-501', title: 'Lỗi đường dẫn screenshot', group: 'compat', severity: 'low', hint: 'Screenshot path không resolve được.', cause: 'Không lưu được ảnh chụp màn hình.', solutions: ['Bỏ qua'], icon: '📸', retryable: false, skippable: true },
  { code: 'DG-502', title: 'Thứ tự test case không khớp', group: 'compat', severity: 'low', hint: 'Case ordering mismatch.', cause: 'Thứ tự chạy test không đúng kỳ vọng.', solutions: ['Bỏ qua'], icon: '📋', retryable: false, skippable: true },
  { code: 'DG-503', title: 'Kiểm tra async quá thời gian', group: 'recovery', severity: 'medium', hint: 'Async verification timeout.', cause: 'Quá trình kiểm tra bất đồng bộ mất quá lâu.', solutions: ['Thử lại', 'Kiểm tra kết nối mạng'], icon: '⏱', retryable: true, skippable: true },

  // ═══════════════════════════════════════════════════
  // Video editor (600-699)
  // ═══════════════════════════════════════════════════
  { code: 'DG-600', title: 'Lỗi pipeline video', group: 'video-edit', severity: 'high', hint: 'FFmpeg pipeline failed.', cause: 'Quá trình xử lý video gặp lỗi.', solutions: ['Kiểm tra file video gốc', 'Tắt plugin phức tạp', 'Bỏ qua video này'], icon: '🎬', retryable: true, skippable: true },
  { code: 'DG-601', title: 'Cấu hình plugin không hợp lệ', group: 'video-edit', severity: 'medium', hint: 'Plugin params validation failed.', cause: 'Tham số plugin chỉnh sửa video không đúng.', solutions: ['Kiểm tra lại cấu hình plugin', 'Dùng cài đặt mặc định'], icon: '🔧', retryable: true, skippable: true },
  { code: 'DG-610', title: 'Lỗi chỉnh sửa video', group: 'video-edit', severity: 'high', hint: 'Single-pass encoding failed.', cause: 'Quá trình chỉnh sửa video bị lỗi.', solutions: ['Bỏ qua video này', 'Kiểm tra file video gốc', 'Tắt plugin phức tạp'], icon: '✂️', retryable: true, skippable: true, troubleshootHandler: 'DG-610' },
  { code: 'DG-611', title: 'Plugin thiếu multi-pass', group: 'video-edit', severity: 'high', hint: 'Plugin không có buildMultiPassCommands().', cause: 'Plugin chưa hoàn thiện (thiếu xử lý multi-pass).', solutions: ['Dùng plugin khác', 'Liên hệ hỗ trợ'], icon: '🔧', retryable: false, skippable: true },
  { code: 'DG-612', title: 'Lỗi bước multi-pass', group: 'video-edit', severity: 'high', hint: 'Multi-pass step N failed.', cause: 'Một bước trong quá trình xử lý video bị lỗi.', solutions: ['Bỏ qua video này', 'Kiểm tra file trung gian'], icon: '🔧', retryable: true, skippable: true },

  // ═══════════════════════════════════════════════════
  // Sentry (700-719)
  // ═══════════════════════════════════════════════════
  { code: 'DG-700', title: 'Lỗi Sentry API', group: 'sentry', severity: 'high', hint: 'Sentry API trả về lỗi.', cause: 'Không gọi được Sentry API.', solutions: ['Kiểm tra auth token', 'Kiểm tra kết nối mạng'], icon: '📡', retryable: true, skippable: true },
  { code: 'DG-701', title: 'Thiếu Sentry OAuth Client ID', group: 'sentry', severity: 'high', hint: 'SENTRY_OAUTH_CLIENT_ID chưa cấu hình.', cause: 'Chưa cấu hình Sentry OAuth.', solutions: ['Đặt SENTRY_OAUTH_CLIENT_ID trong môi trường', 'Bỏ qua nếu không dùng Sentry'], icon: '🔧', retryable: false, skippable: true },
  { code: 'DG-702', title: 'Lỗi xác thực Sentry', group: 'sentry', severity: 'high', hint: 'Device auth grant failed.', cause: 'Xác thực OAuth với Sentry bị từ chối.', solutions: ['Thử lại', 'Kiểm tra cấu hình client'], icon: '🔐', retryable: true, skippable: true },
  { code: 'DG-703', title: 'Phản hồi Sentry không đầy đủ', group: 'sentry', severity: 'high', hint: 'Device auth response thiếu fields.', cause: 'Sentry trả về dữ liệu không đầy đủ.', solutions: ['Thử lại'], icon: '📋', retryable: true, skippable: true },
  { code: 'DG-704', title: 'Chưa kết nối Sentry', group: 'sentry', severity: 'medium', hint: 'Không có kết nối OAuth.', cause: 'Chưa kết nối tài khoản Sentry.', solutions: ['Kết nối Sentry qua OAuth trong Settings'], icon: '🔗', retryable: false, skippable: true },
  { code: 'DG-705', title: 'Không có tổ chức Sentry', group: 'sentry', severity: 'high', hint: 'Token không có org nào.', cause: 'Token không có quyền truy cập tổ chức nào.', solutions: ['Kiểm tra quyền token', 'Xác thực lại'], icon: '🏢', retryable: true, skippable: true },
  { code: 'DG-706', title: 'Thiếu slug tổ chức Sentry', group: 'sentry', severity: 'high', hint: 'Organization slug parsing failed.', cause: 'Không xác định được tổ chức Sentry.', solutions: ['Kiểm tra lại kết nối', 'Thử lại'], icon: '🏢', retryable: true, skippable: true },
  { code: 'DG-707', title: 'Không có dự án Sentry', group: 'sentry', severity: 'high', hint: 'Không có project accessible.', cause: 'Tổ chức không có dự án nào.', solutions: ['Tạo dự án trên Sentry', 'Kiểm tra quyền'], icon: '📦', retryable: false, skippable: true },

  // ── Troubleshooting service (720-739) ─────────────
  { code: 'DG-720', title: 'Không tìm thấy phiên troubleshooting', group: 'meta', severity: 'medium', hint: 'Run ID không tồn tại.', cause: 'Phiên kiểm tra đã bị xóa hoặc chưa tạo.', solutions: ['Chạy lại kiểm tra'], icon: '🔍', retryable: true, skippable: true },
  { code: 'DG-721', title: 'Lỗi gửi staging Sentry', group: 'sentry', severity: 'high', hint: 'Staging send failed.', cause: 'Không gửi được sự kiện test đến Sentry.', solutions: ['Kiểm tra DSN', 'Kiểm tra mạng'], icon: '📡', retryable: true, skippable: true },
  { code: 'DG-722', title: 'Lỗi xác nhận staging Sentry', group: 'sentry', severity: 'medium', hint: 'Event sent nhưng verify failed.', cause: 'Sự kiện đã gửi nhưng không xác nhận được.', solutions: ['Đợi vài phút rồi thử lại'], icon: '📡', retryable: true, skippable: true },
  { code: 'DG-723', title: 'Case troubleshooting không tồn tại', group: 'meta', severity: 'medium', hint: 'Case ID không có trong registry.', cause: 'Mã case kiểm tra không hợp lệ.', solutions: ['Kiểm tra lại case ID', 'Liên hệ hỗ trợ'], icon: '❓', retryable: false, skippable: true },
  { code: 'DG-724', title: 'Case chưa được triển khai', group: 'meta', severity: 'low', hint: 'Case planned nhưng chưa code.', cause: 'Tính năng kiểm tra này chưa hoàn thiện.', solutions: ['Đợi bản cập nhật'], icon: '🚧', retryable: false, skippable: true },
  { code: 'DG-725', title: 'Case đang chạy', group: 'meta', severity: 'low', hint: 'Concurrent guard.', cause: 'Phiên kiểm tra này đang chạy rồi.', solutions: ['Đợi phiên hiện tại hoàn thành'], icon: '⏳', retryable: false, skippable: true },
  { code: 'DG-726', title: 'Không có runner cho case', group: 'meta', severity: 'high', hint: 'Runner function not found.', cause: 'Không tìm thấy module xử lý cho case này.', solutions: ['Liên hệ hỗ trợ với mã DG-726'], icon: '🔧', retryable: false, skippable: true },

  // ═══════════════════════════════════════════════════
  // AsyncTask (740-759)
  // ═══════════════════════════════════════════════════
  { code: 'DG-740', title: 'Không có handler cho async task', group: 'async-task', severity: 'high', hint: 'Task type không có handler.', cause: 'Loại task này chưa được đăng ký xử lý.', solutions: ['Kiểm tra cấu hình task', 'Liên hệ hỗ trợ'], icon: '⚙️', retryable: false, skippable: true },
  { code: 'DG-741', title: 'Dữ liệu async task không hợp lệ', group: 'async-task', severity: 'medium', hint: 'Handler.validate() rejected payload.', cause: 'Dữ liệu task không đúng định dạng.', solutions: ['Kiểm tra lại cấu hình', 'Thử lại'], icon: '📋', retryable: true, skippable: true },
  { code: 'DG-742', title: 'Async task bị crash', group: 'async-task', severity: 'high', hint: 'Handler threw during execute().', cause: 'Task bị lỗi nghiêm trọng khi chạy.', solutions: ['Thử lại', 'Kiểm tra log chi tiết'], icon: '💥', retryable: true, skippable: true },

  // ═══════════════════════════════════════════════════
  // Debug / meta (900-999)
  // ═══════════════════════════════════════════════════
  { code: 'DG-900', title: 'Debug panel smoke test', group: 'meta', severity: 'info', hint: 'Kiểm tra UI debug panel.', cause: 'Test nội bộ cho giao diện debug.', solutions: ['Bỏ qua'], icon: '🧪', retryable: false, skippable: true },
  { code: 'DG-901', title: 'Thiếu handler cho test case', group: 'meta', severity: 'critical', hint: 'caseId trong catalog không có runner.', cause: 'Test case chưa có module xử lý.', solutions: ['Liên hệ hỗ trợ'], icon: '🧪', retryable: false, skippable: true },
]

// ── Lookup helpers ──────────────────────────────────

/** Map cho O(1) lookup theo code */
export const ERROR_CODE_MAP = new Map<string, ErrorCodeMeta>(
  ERROR_REGISTRY.map(entry => [entry.code, entry])
)

/** Lấy metadata lỗi, trả DG-000 nếu không tìm thấy */
export function getErrorCode(code: string): ErrorCodeMeta {
  return ERROR_CODE_MAP.get(code) ?? ERROR_CODE_MAP.get('DG-000')!
}

/** Registry đầy đủ (immutable) */
export const ERROR_CODES: readonly ErrorCodeMeta[] = Object.freeze([...ERROR_REGISTRY])

/** Kiểm tra code có tồn tại không */
export function isValidErrorCode(code: string): boolean {
  return ERROR_CODE_MAP.has(code)
}

/** Lấy tất cả code của 1 group */
export function getCodesByGroup(group: DiagnosticGroup): ErrorCodeMeta[] {
  return ERROR_REGISTRY.filter(entry => entry.group === group)
}

/** Lấy tất cả code >= mức severity */
export function getCodesBySeverity(minSeverity: DiagnosticSeverity): ErrorCodeMeta[] {
  const rank: Record<DiagnosticSeverity, number> = {
    critical: 5, high: 4, medium: 3, low: 2, info: 1,
  }
  const minRank = rank[minSeverity]
  return ERROR_REGISTRY.filter(entry => rank[entry.severity] >= minRank)
}
