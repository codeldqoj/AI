/**
 * Hệ thống Xác thực & Quản lý Tài khoản VMO Đà Nẵng 2026 - 2027
 * Tích hợp:
 * - MongoDB password authentication qua cookie phiên HttpOnly
 * - Giám sát tương tác & Tự động Đăng xuất sau 5 phút không hoạt động (Auto-Logout Idle Tracker)
 * - Đồng bộ phiên đa tab thời gian thực
 */
const VMOAuth = (() => {
  const SESSION_KEY = 'vmo_auth_session';
  const LAST_ACTIVITY_KEY = 'vmo_last_activity_time';

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const sess = JSON.parse(raw);
      if (!sess || !sess.username) return null;
      return sess;
    } catch (e) {
      return null;
    }
  }

  function setSession(user, remember = true) {
    const sessionData = {
      username: user.username,
      role: user.role || 'user',
      ...(Array.isArray(user.educationLevels) ? { educationLevels: user.educationLevels } : {}),
      name: user.fullName || user.name || user.username,
      photoURL: user.photoURL || '',
      uid: user.uid || '',
      provider: user.provider || 'local',
      loginAt: Date.now()
    };
    try {
      const str = JSON.stringify(sessionData);
      if (remember) {
        localStorage.setItem(SESSION_KEY, str);
      } else {
        sessionStorage.setItem(SESSION_KEY, str);
      }
      // Ghi nhận mốc thời gian hoạt động ngay khi đăng nhập
      if (window.VMOIdleTracker) {
        window.VMOIdleTracker.recordActivity();
        window.VMOIdleTracker.start();
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch (e) {}
  }

  async function login(username, password, remember = true) {
    const uClean = (username || '').trim().toLowerCase();
    const pClean = password || '';

    if (!uClean || !pClean) {
      return { success: false, message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!' };
    }

    try {
      const response = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ action: 'login', username: uClean, password: pClean })
      });
      const data = await response.json();
      if (!response.ok || !data.success) return { success: false, message: data.error || 'Đăng nhập thất bại!' };
      setSession(data.user, remember);
      return { success: true, user: data.user };
    } catch { return { success: false, message: 'Không thể kết nối máy chủ xác thực.' }; }
  }

  async function getBootstrapStatus() {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'bootstrap_status' })
      });
      const data = await response.json();
      return response.ok && data.success
        ? { success: true, needsBootstrap: Boolean(data.needsBootstrap) }
        : { success: false, needsBootstrap: false };
    } catch {
      return { success: false, needsBootstrap: false };
    }
  }

  async function bootstrapAdmin(fullName, username, password, remember = true) {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'bootstrap_admin', fullName, username, password })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, message: data.error || 'Không thể khởi tạo quản trị viên.' };
      }
      setSession(data.user, remember);
      return { success: true, user: data.user };
    } catch {
      return { success: false, message: 'Không thể kết nối máy chủ xác thực.' };
    }
  }

  async function adminRequest(action, payload = {}) {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action, ...payload })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, message: data.error || 'Thao tác quản trị thất bại.' };
      }
      return data;
    } catch {
      return { success: false, message: 'Không thể kết nối máy chủ quản lý tài khoản.' };
    }
  }

  function listUsers() {
    return adminRequest('list_users');
  }

  function createUser(username, password, role = 'student', fullName = '', educationLevels = []) {
    return adminRequest('create_user', { username, password, role, fullName, educationLevels });
  }

  function deleteUser(targetUsername) {
    return adminRequest('delete_user', { targetUsername });
  }

  function updateEducationLevels(targetUsername, educationLevels) {
    return adminRequest('update_education_levels', { targetUsername, educationLevels });
  }

  function updateRole(targetUsername, role) {
    return adminRequest('update_role', { targetUsername, role });
  }

  function updatePassword(targetUsername, newPassword) {
    return adminRequest('update_password', { targetUsername, newPassword });
  }

  async function logout(reason = '') {
    if (window.VMOIdleTracker) {
      window.VMOIdleTracker.stop();
    }

    // Xóa session cục bộ ngay lập tức để không bị kẹt phiên
    clearSession();
    try {
      await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ action: 'logout' }) });
    } catch (e) { console.warn('Không thể thông báo đăng xuất đến máy chủ:', e); }

    let targetUrl = 'login.html';
    if (reason) {
      targetUrl += `?reason=${encodeURIComponent(reason)}`;
    }

    // Chuyển hướng về trang đăng nhập
    try {
      window.location.href = targetUrl;
    } catch (e) {
      window.location.replace(targetUrl);
    }
  }

  function requireAuth(redirectUrl = 'login.html') {
    const sess = getSession();
    if (!sess) {
      window.location.replace(redirectUrl);
      return null;
    }

    // Kiểm tra xem phiên làm việc có bị quá 5 phút không hoạt động từ trước không
    const lastAct = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 phút

    if (lastAct && (now - lastAct) > TIMEOUT) {
      logout('idle_timeout');
      return null;
    }

    // Khởi động giám sát 5 phút không tác động
    if (window.VMOIdleTracker) {
      window.VMOIdleTracker.start();
    }

    fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'me' }) })
      .then(async response => {
        if (response.status === 401) { await logout('permissions_changed');return; }
        if (!response.ok) return;
        const data = await response.json();
        if (!data.success || !data.user) return;
        if (data.user.role !== sess.role || JSON.stringify(data.user.educationLevels) !== JSON.stringify(sess.educationLevels)) {
          const remember = !!localStorage.getItem(SESSION_KEY);
          clearSession();setSession(data.user, remember);window.location.reload();
        }
      }).catch(() => {});
    return sess;
  }

  async function redirectIfLoggedIn(redirectUrl = 'index.html') {
    const sess = getSession();
    if (!sess) return false;

    // Kiểm tra tính hợp lệ về thời gian
    const lastAct = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 phút
    if (lastAct && (now - lastAct) > TIMEOUT) {
      clearSession();
      return false;
    }

    try {
      const response = await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'me' }) });
      if (response.status === 401) { clearSession();return false; }
      if (!response.ok) return false;
      const data = await response.json();
      if (!data.success || !data.user) return false;
      const remember = !!localStorage.getItem(SESSION_KEY);
      clearSession();setSession(data.user, remember);
      window.location.replace(redirectUrl);
      return true;
    } catch { return false; }
  }

  return {
    getSession,
    setSession,
    clearSession,
    login,
    getBootstrapStatus,
    bootstrapAdmin,
    listUsers,
    logout,
    requireAuth,
    redirectIfLoggedIn,
    createUser,
    deleteUser,
    updatePassword,
    updateRole,
    updateEducationLevels,
    LAST_ACTIVITY_KEY
  };
})();

/**
 * =========================================================================
 * VMOIdleTracker: Bộ giám sát tự động đăng xuất sau 5 phút không tương tác
 * =========================================================================
 * - Chuẩn thương mại hóa bảo mật cấp cao
 * - Thời gian chờ tối đa: 5 phút (300,000 ms)
 * - Cảnh báo trước 30 giây (ở phút thứ 4:30) kèm đồng hồ đếm ngược
 * - Tự động đồng bộ liên tab (Cross-tab activity synchronization)
 * - Tối ưu hiệu năng: throttle bắt sự kiện chuột & cuộn
 */
const VMOIdleTracker = (() => {
  const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 phút = 300,000 ms
  const WARNING_TIME_MS = 30 * 1000;   // 30 giây cảnh báo đếm ngược trước khi logout
  const WARNING_THRESHOLD_MS = IDLE_LIMIT_MS - WARNING_TIME_MS; // 4 phút 30 giây

  let checkInterval = null;
  let isWarningVisible = false;
  let lastThrottleTime = 0;

  // Lấy mốc thời gian thao tác gần nhất
  function getLastActivity() {
    const val = localStorage.getItem(VMOAuth.LAST_ACTIVITY_KEY);
    return val ? parseInt(val, 10) : Date.now();
  }

  // Ghi nhận người dùng vừa có tương tác
  function recordActivity(force = false) {
    const now = Date.now();
    // Throttle để không spam localStorage khi di chuột liên tục (tối đa 1 lần / 2 giây)
    if (!force && (now - lastThrottleTime < 2000)) {
      return;
    }
    lastThrottleTime = now;
    localStorage.setItem(VMOAuth.LAST_ACTIVITY_KEY, now.toString());

    // Nếu cảnh báo đang hiện mà người dùng tương tác lại thì ẩn cảnh báo
    if (isWarningVisible) {
      hideWarningModal();
    }
  }

  // Xây dựng Modal Cảnh báo Đếm ngược
  function ensureWarningModal() {
    let overlay = document.getElementById('idleWarningModal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'idleWarningModal';
      overlay.className = 'idle-modal-overlay';
      overlay.innerHTML = `
        <div class="idle-modal-card" role="alertdialog" aria-modal="true" aria-labelledby="idleModalTitle">
          <div class="idle-icon-wrap">⏱️</div>
          <h2 id="idleModalTitle" class="idle-modal-title">Cảnh báo hết hạn phiên làm việc</h2>
          <p class="idle-modal-desc">
            Bạn đã không có thao tác nào trong gần 5 phút. Để bảo vệ dữ liệu và bảo mật phiên truy cập, hệ thống sẽ tự động đăng xuất sau:
          </p>
          <div class="idle-timer-badge">
            <span>⏳</span>
            <span id="idleCountdownText">30 giây</span>
          </div>
          <div class="idle-modal-actions">
            <button type="button" id="btnStayLoggedIn" class="btn-stay-active">
              ✅ Tiếp tục học tập
            </button>
            <button type="button" id="btnIdleLogoutNow" class="btn-idle-logout">
              🚪 Đăng xuất ngay
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const btnStay = document.getElementById('btnStayLoggedIn');
      if (btnStay) {
        btnStay.addEventListener('click', () => {
          recordActivity(true);
          hideWarningModal();
        });
      }

      const btnLogoutNow = document.getElementById('btnIdleLogoutNow');
      if (btnLogoutNow) {
        btnLogoutNow.addEventListener('click', () => {
          VMOAuth.logout('user_action');
        });
      }
    }
    return overlay;
  }

  function showWarningModal(remainingSeconds) {
    const overlay = ensureWarningModal();
    const textEl = document.getElementById('idleCountdownText');
    if (textEl) {
      textEl.textContent = `${remainingSeconds} giây`;
    }
    if (!isWarningVisible) {
      isWarningVisible = true;
      overlay.classList.add('active');
    }
  }

  function hideWarningModal() {
    const overlay = document.getElementById('idleWarningModal');
    if (overlay) {
      overlay.classList.remove('active');
    }
    isWarningVisible = false;
  }

  // Kiểm tra chu kỳ mỗi 1 giây
  function tick() {
    const session = VMOAuth.getSession();
    if (!session) {
      stop();
      return;
    }

    const now = Date.now();
    const last = getLastActivity();
    const elapsed = now - last;

    // Trường hợp 1: Đã đủ 5 phút không tương tác -> TỰ ĐỘNG ĐĂNG XUẤT
    if (elapsed >= IDLE_LIMIT_MS) {
      stop();
      hideWarningModal();
      console.warn('VMOIdleTracker: Đăng xuất tự động do không có tương tác sau 5 phút.');
      VMOAuth.logout('idle_timeout');
      return;
    }

    // Trường hợp 2: Đạt mốc 4 phút 30 giây -> BẬT CẢNH BÁO ĐẾM NGƯỢC 30s
    if (elapsed >= WARNING_THRESHOLD_MS) {
      const remainingMs = IDLE_LIMIT_MS - elapsed;
      const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
      showWarningModal(remainingSec);
    } else {
      if (isWarningVisible) {
        hideWarningModal();
      }
    }
  }

  // Lắng nghe tất cả các sự kiện tương tác của người dùng
  function bindActivityEvents() {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(evt => {
      window.addEventListener(evt, () => recordActivity(false), { passive: true });
    });

    // Đồng bộ đa tab: nếu học sinh thao tác ở tab khác thì tab này cũng làm mới
    window.addEventListener('storage', (e) => {
      if (e.key === VMOAuth.LAST_ACTIVITY_KEY) {
        if (isWarningVisible) {
          hideWarningModal();
        }
      }
    });
  }

  function start() {
    if (checkInterval) return;
    recordActivity(true);
    bindActivityEvents();
    checkInterval = setInterval(tick, 1000);
  }

  function stop() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    hideWarningModal();
  }

  return {
    start,
    stop,
    recordActivity,
    getLastActivity
  };
})();

// Export globally
window.VMOAuth = VMOAuth;
window.VMOIdleTracker = VMOIdleTracker;
