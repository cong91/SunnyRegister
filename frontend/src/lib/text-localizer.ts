import { viTextMap } from './vi-text-map'

export type LocalizableLanguage = 'vi-VN' | 'en-US'

const fallbackSegments = [
  ['支付方式', 'phương thức thanh toán'],
  ['注册任务', 'tác vụ đăng ký'],
  ['登录任务', 'tác vụ đăng nhập'],
  ['手机号', 'số điện thoại'],
  ['接码链接', 'liên kết nhận mã SMS'],
  ['接码', 'nhận mã SMS'],
  ['反代配置', 'cấu hình reverse proxy'],
  ['反代导入', 'nhập reverse proxy'],
  ['反代', 'reverse proxy'],
  ['验证码', 'mã xác minh'],
  ['账号', 'tài khoản'],
  ['账户', 'tài khoản'],
  ['邮箱', 'email'],
  ['任务', 'tác vụ'],
  ['配置', 'cấu hình'],
  ['检测', 'kiểm tra'],
  ['探测', 'thăm dò'],
  ['刷新', 'làm mới'],
  ['导入', 'nhập'],
  ['导出', 'xuất'],
  ['保存', 'lưu'],
  ['删除', 'xóa'],
  ['清除', 'xóa'],
  ['选择', 'chọn'],
  ['请输入', 'Vui lòng nhập'],
  ['请先', 'Vui lòng'],
  ['暂无', 'Chưa có'],
  ['全部', 'Tất cả'],
  ['成功', 'thành công'],
  ['失败', 'thất bại'],
  ['进行中', 'đang thực hiện'],
  ['等待', 'đang chờ'],
  ['完成', 'hoàn tất'],
  ['状态', 'trạng thái'],
  ['操作', 'thao tác'],
  ['日志', 'nhật ký'],
  ['支付', 'thanh toán'],
  ['代理', 'proxy'],
  ['链接', 'liên kết'],
  ['密码', 'mật khẩu'],
  ['关闭', 'đóng'],
  ['取消', 'hủy'],
  ['确认', 'xác nhận'],
  ['重试', 'thử lại'],
  ['国家', 'quốc gia'],
  ['套餐', 'gói'],
  ['每页', 'mỗi trang'],
  ['上一页', 'trang trước'],
  ['下一页', 'trang sau'],
  ['已过期', 'đã hết hạn'],
  ['未检测', 'chưa kiểm tra'],
  ['可用', 'khả dụng'],
  ['无效', 'không hợp lệ'],
  ['启用', 'bật'],
  ['停用', 'tắt'],
].sort(([left], [right]) => right.length - left.length)

const generatedSegments = Object.entries(viTextMap)
  .filter(([source, target]) => source.trim().length > 1 && source.length <= 64 && !source.includes('\n') && !source.includes('{') && target.trim().length > 0)
  .sort(([left], [right]) => right.length - left.length)

const translationOverrides: Readonly<Record<string, string>> = {
  手机: 'điện thoại',
  邮箱: 'email',
  有效期: 'thời hạn hiệu lực',
  验证码: 'mã xác minh',
  已设置: 'Đã thiết lập',
  停止中: 'Đang dừng',
  清除: 'Xóa',
}

const translatedTermCorrections = [
  ['Liên kết mã vá lỗi', 'liên kết nhận mã SMS'],
  ['Liên kết mã tiếp nhận', 'liên kết nhận mã SMS'],
  ['Liên kết đầu nối', 'liên kết nhận mã SMS'],
  ['mã bản vá', 'nhận mã'],
  ['mã tiếp nhận', 'nhận mã'],
  ['Mã kết nối', 'nhận mã'],
  ['Nhà cung cấp Đầu nối', 'Nhà cung cấp nhận mã'],
  ['Nhà cung cấp mã bản vá', 'Nhà cung cấp nhận mã'],
  ['Nhà cung cấp FireFox Patch', 'Nhà cung cấp nhận mã FireFox'],
  ['kháng sinh', 'reverse proxy'],
  ['chống phát', 'reverse proxy'],
  ['chống thế hệ', 'reverse proxy'],
  ['chống thay thế', 'reverse proxy'],
  ['đảo ngược', 'reverse proxy'],
  ['Nhập khẩu chống', 'Nhập reverse proxy'],
  ['nhập chống phát', 'nhập reverse proxy'],
  ['Nhập Chống Phát điện', 'Nhập reverse proxy'],
  ['đầu nối tác dụng dài', 'liên kết nhận mã dài hạn'],
  ['đường ngang', 'dấu gạch ngang'],
  ['Làm mát', 'chờ cooldown'],
  ['Không hoạt động', 'Đang dừng'],
  ['cửa hàng ủy quyền', 'proxy'],
  ['số truy cập một lần', 'số nhận mã dùng một lần'],
  ['không có hiệu quả', 'không hợp lệ'],
  ['cũng có', 'trên tổng'],
  ['Chainlifting', 'liên kết'],
  ['cơ hội đăng ký', 'công cụ đăng ký'],
  ['nền tảng truy cập', 'nền tảng nhận mã'],
]

function correctTranslatedTerms(value: string) {
  return translatedTermCorrections.reduce((current, [source, target]) => current.replaceAll(source, target), value)
}

function restoreProtectedTokens(source: string, translated: string) {
  const tokens = source.match(/\{[\w]+\}|https?:\/\/\S+/gu) || []
  return translated.replace(/(?:@@SUNNY_TOKEN_(\d+)@@|@\s*@\s*sunny_token_(\d+)\s*@\s*@)/giu, (_, first, second) => tokens[Number(first ?? second)] || '')
}

function translateToVietnamese(value: string) {
  const override = translationOverrides[value]
  if (override) return correctTranslatedTerms(override)
  const exact = viTextMap[value]
  if (exact) return correctTranslatedTerms(restoreProtectedTokens(value, exact))
  if (!/[\u3400-\u9fff]/u.test(value)) return value
  let translated = value
  for (const [source, target] of generatedSegments) {
    if (translated.includes(source)) translated = translated.split(source).join(target)
  }
  for (const [source, target] of fallbackSegments) {
    if (translated.includes(source)) translated = translated.split(source).join(target)
  }
  return correctTranslatedTerms(translated)
}

export function localizeText(value: string, language: LocalizableLanguage = 'vi-VN') {
  return language === 'vi-VN' ? translateToVietnamese(value) : value
}
