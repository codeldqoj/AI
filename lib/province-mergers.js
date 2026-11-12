// Danh mục 34 tỉnh/thành sau sáp nhập, chuẩn hóa từ bảng do quản trị viên cung cấp.
// Tên hiện hành theo cách hiển thị của frontend; members giữ tên địa phương cũ
// để truy hồi toàn bộ dữ liệu lịch sử khi dự đoán hoặc phân tích xu hướng.
export const CURRENT_PROVINCE_GROUPS = Object.freeze([
  ['Tuyên Quang', ['Hà Giang', 'Tuyên Quang']],
  ['Cao Bằng', ['Cao Bằng']],
  ['Lai Châu', ['Lai Châu']],
  ['Lào Cai', ['Lào Cai', 'Yên Bái']],
  ['Thái Nguyên', ['Bắc Kạn', 'Thái Nguyên']],
  ['Điện Biên', ['Điện Biên']],
  ['Lạng Sơn', ['Lạng Sơn']],
  ['Sơn La', ['Sơn La']],
  ['Phú Thọ', ['Hòa Bình', 'Vĩnh Phúc', 'Phú Thọ']],
  ['Bắc Ninh', ['Bắc Giang', 'Bắc Ninh']],
  ['Quảng Ninh', ['Quảng Ninh']],
  ['Hà Nội', ['Hà Nội']],
  ['Hải Phòng', ['Hải Dương', 'Hải Phòng']],
  ['Hưng Yên', ['Thái Bình', 'Hưng Yên']],
  ['Ninh Bình', ['Hà Nam', 'Ninh Bình', 'Nam Định']],
  ['Thanh Hóa', ['Thanh Hóa']],
  ['Nghệ An', ['Nghệ An']],
  ['Hà Tĩnh', ['Hà Tĩnh']],
  ['Quảng Trị', ['Quảng Bình', 'Quảng Trị']],
  ['Huế', ['Huế']],
  ['Đà Nẵng', ['Quảng Nam', 'Đà Nẵng']],
  ['Quảng Ngãi', ['Quảng Ngãi', 'Kon Tum']],
  ['Gia Lai', ['Gia Lai', 'Bình Định']],
  ['Đắk Lắk', ['Phú Yên', 'Đắk Lắk']],
  ['Khánh Hòa', ['Khánh Hòa', 'Ninh Thuận']],
  ['Lâm Đồng', ['Đắk Nông', 'Lâm Đồng', 'Bình Thuận']],
  ['Đồng Nai', ['Bình Phước', 'Đồng Nai']],
  ['Tây Ninh', ['Long An', 'Tây Ninh']],
  ['Thành phố Hồ Chí Minh', ['Bình Dương', 'Hồ Chí Minh', 'Bà Rịa – Vũng Tàu']],
  ['Đồng Tháp', ['Tiền Giang', 'Đồng Tháp']],
  ['An Giang', ['Kiên Giang', 'An Giang']],
  ['Vĩnh Long', ['Bến Tre', 'Vĩnh Long', 'Trà Vinh']],
  ['Cần Thơ', ['Sóc Trăng', 'Hậu Giang', 'Cần Thơ']],
  ['Cà Mau', ['Bạc Liêu', 'Cà Mau']]
].map(([currentProvince, members]) => Object.freeze({
  currentProvince,
  members: Object.freeze([...members])
})));

export function normalizeProvinceName(value) {
  let result = String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (/^(?:tp\s*)?hcm$/.test(result) || result === 'tphcm') result = 'ho chi minh';
  result = result.replace(/^(?:tinh|thanh pho|tp)\s+/, '');
  return result;
}

const normalizedGroups = CURRENT_PROVINCE_GROUPS.map(group => ({
  ...group,
  keys: new Set([group.currentProvince, ...group.members].map(normalizeProvinceName))
}));

function anchorSlug(value) {
  return normalizeProvinceName(value).replace(/\s+/g, '-');
}

export function provinceHistoryContext(value, explicitAnchor = '') {
  const key = normalizeProvinceName(value);
  const group = normalizedGroups.find(item => item.keys.has(key));
  const currentProvince = group?.currentProvince || String(value || '').trim();
  const members = group ? [...group.members] : currentProvince ? [currentProvince] : [];
  const normalizedMembers = new Set(members.map(normalizeProvinceName));
  const anchors = new Set(members.map(member => `tst-${anchorSlug(member)}`));
  if (explicitAnchor) anchors.add(String(explicitAnchor));
  if (normalizeProvinceName(currentProvince) === 'ho chi minh') {
    ['tst-tp-hcm', 'tst-tphcm', 'tst-ho-chi-minh'].forEach(anchor => anchors.add(anchor));
  }
  return {
    currentProvince,
    members,
    normalizedMembers,
    anchors,
    merged: members.length > 1
  };
}

export function matchesProvinceHistory(item, targetProvince, explicitAnchor = '') {
  const context = provinceHistoryContext(targetProvince, explicitAnchor);
  if (item?.anchor && context.anchors.has(String(item.anchor))) return true;
  return Boolean(item?.province) && context.normalizedMembers.has(normalizeProvinceName(item.province));
}

export function currentProvinceName(value) {
  return provinceHistoryContext(value).currentProvince || String(value || '').trim();
}
