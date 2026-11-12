/**
 * Danh mục địa phương TST dùng độc lập với nội dung tab tải lười.
 * region phải khớp với các bộ lọc BAC / TRUNG / NAM trên frontend.
 */
(() => {
  const provinces = [
    ['Hà Nội', 'tst-ha-noi', 'BAC'],
    ['Hải Phòng', 'tst-hai-phong', 'BAC'],
    ['Lai Châu', 'tst-lai-chau', 'BAC'],
    ['Điện Biên', 'tst-dien-bien', 'BAC'],
    ['Sơn La', 'tst-son-la', 'BAC'],
    ['Lạng Sơn', 'tst-lang-son', 'BAC'],
    ['Cao Bằng', 'tst-cao-bang', 'BAC'],
    ['Tuyên Quang', 'tst-tuyen-quang', 'BAC'],
    ['Lào Cai', 'tst-lao-cai', 'BAC'],
    ['Thái Nguyên', 'tst-thai-nguyen', 'BAC'],
    ['Phú Thọ', 'tst-phu-tho', 'BAC'],
    ['Bắc Ninh', 'tst-bac-ninh', 'BAC'],
    ['Quảng Ninh', 'tst-quang-ninh', 'BAC'],
    ['Hưng Yên', 'tst-hung-yen', 'BAC'],
    ['Ninh Bình', 'tst-ninh-binh', 'BAC'],
    ['Huế', 'tst-hue', 'TRUNG'],
    ['Đà Nẵng', 'tst-da-nang', 'TRUNG'],
    ['Thanh Hóa', 'tst-thanh-hoa', 'TRUNG'],
    ['Nghệ An', 'tst-nghe-an', 'TRUNG'],
    ['Hà Tĩnh', 'tst-ha-tinh', 'TRUNG'],
    ['Quảng Trị', 'tst-quang-tri', 'TRUNG'],
    ['Quảng Ngãi', 'tst-quang-ngai', 'TRUNG'],
    ['Gia Lai', 'tst-gia-lai', 'TRUNG'],
    ['Khánh Hòa', 'tst-khanh-hoa', 'TRUNG'],
    ['Lâm Đồng', 'tst-lam-dong', 'TRUNG'],
    ['Đắk Lắk', 'tst-dak-lak', 'TRUNG'],
    ['Thành phố Hồ Chí Minh', 'tst-tp-hcm', 'NAM'],
    ['Cần Thơ', 'tst-can-tho', 'NAM'],
    ['Đồng Nai', 'tst-dong-nai', 'NAM'],
    ['Tây Ninh', 'tst-tay-ninh', 'NAM'],
    ['Vĩnh Long', 'tst-vinh-long', 'NAM'],
    ['Đồng Tháp', 'tst-dong-thap', 'NAM'],
    ['Cà Mau', 'tst-ca-mau', 'NAM'],
    ['An Giang', 'tst-an-giang', 'NAM']
  ].map(([name, anchor, region], index) => ({
    name,
    anchor,
    region,
    type: 'province',
    order: index + 1
  }));

  const universitySchools = [
    ['Trường THPT Chuyên Khoa học Tự nhiên – ĐHQGHN', 'tst-khtn', 'BAC'],
    ['Trường THPT Chuyên Đại học Sư phạm Hà Nội', 'tst-csp', 'BAC'],
    ['Trường THPT Chuyên – Đại học Vinh', 'tst-dh-vinh', 'TRUNG'],
    ['Trường Phổ thông Năng khiếu – ĐHQG TP.HCM', 'tst-ptnk', 'NAM']
  ].map(([name, anchor, region], index) => ({
    name,
    anchor,
    region,
    type: 'university_school',
    order: 101 + index
  }));

  window.VMO_TST_LOCATIONS = Object.freeze(
    [...provinces, ...universitySchools].map(item => Object.freeze(item))
  );
})();
