/**
 * Cấu hình & Tích hợp Firebase Authentication và Cloud Firestore
 * Hệ thống Ôn luyện VMO Đà Nẵng 2026 - 2027
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  getDocFromServer 
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

// Thông tin cấu hình Firebase đã được cấp phát
const firebaseConfig = {
  projectId: "gen-lang-client-0689542562",
  appId: "1:49057791876:web:12c6665de8765d0e35e7d1",
  apiKey: "AIzaSyA9UcGPE-8lsd5Jtn92paPpKkd0gOsVmQ4",
  authDomain: "gen-lang-client-0689542562.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-vmotst-00387cbe-6cab-4560-b917-c04a2c466643",
  storageBucket: "gen-lang-client-0689542562.firebasestorage.app",
  messagingSenderId: "49057791876"
};

// Khởi tạo Firebase App, Auth & Firestore
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Cấu hình duy trì phiên đăng nhập cục bộ
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn('Firebase setPersistence warning:', err);
});

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Kiểm tra kết nối Firestore khi khởi động (theo chuẩn quy định)
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'users', 'health-check'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Vui lòng kiểm tra kết nối mạng của bạn.");
    }
  }
}
testFirestoreConnection();

/**
 * Đăng nhập / Đăng ký nhanh bằng Google
 */
async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const fbUser = result.user;
    if (!fbUser) {
      return { success: false, message: 'Không thể nhận diện tài khoản Google!' };
    }

    const email = fbUser.email || '';
    const displayName = fbUser.displayName || email.split('@')[0] || 'Học viên VMO';
    const photoURL = fbUser.photoURL || '';
    const uid = fbUser.uid;

    // Phân quyền: email admin quản trị tối cao hoặc kiểm tra dữ liệu đã lưu
    const isOwnerAdmin = email.toLowerCase() === 'vutrhuy81@gmail.com';
    let role = isOwnerAdmin ? 'admin' : 'user';

    try {
      // Đọc thông tin người dùng từ Firestore nếu đã tồn tại
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data && data.role) {
          role = data.role;
        }
      }

      // Lưu/cập nhật hồ sơ vào Firestore
      await setDoc(userDocRef, {
        uid: uid,
        email: email,
        displayName: displayName,
        photoURL: photoURL,
        role: role,
        authProvider: 'google',
        lastLoginAt: new Date().toISOString()
      }, { merge: true });

    } catch (fsErr) {
      console.warn('Lưu Firestore thông tin người dùng:', fsErr);
    }

    // Đồng bộ vào phiên đăng nhập hệ thống VMO
    const sessionUser = {
      username: email,
      name: displayName,
      role: role,
      photoURL: photoURL,
      uid: uid,
      provider: 'google'
    };

    if (window.VMOAuth) {
      window.VMOAuth.setSession(sessionUser, true);
    }

    // Đánh dấu mốc hoạt động đầu tiên cho Idle Tracker
    if (window.VMOIdleTracker) {
      window.VMOIdleTracker.recordActivity();
    }

    return {
      success: true,
      user: sessionUser
    };

  } catch (error) {
    console.error('Lỗi đăng nhập Google Firebase:', error);
    let msg = 'Đăng nhập Google thất bại. Vui lòng thử lại!';
    if (error.code === 'auth/popup-closed-by-user') {
      msg = 'Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất.';
    } else if (error.code === 'auth/popup-blocked') {
      msg = 'Trình duyệt đã chặn cửa sổ pop-up. Vui lòng cho phép pop-up để đăng nhập!';
    } else if (error.code === 'auth/network-request-failed') {
      msg = 'Lỗi kết nối mạng khi xác thực với máy chủ Google.';
    }
    return { success: false, message: msg, error };
  }
}

/**
 * Đăng xuất khỏi Firebase Auth
 */
async function signOutGoogle() {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Firebase signOut warning:', e);
  }
}

// Đối tượng dịch vụ Firebase toàn cục
const VMOFirebase = {
  app,
  auth,
  db,
  signInWithGoogle,
  signOutGoogle,
  getCurrentUser: () => auth.currentUser
};

window.VMOFirebase = VMOFirebase;
export default VMOFirebase;
