function verificationError(message, status = 400, code = 'INVALID_SUBMISSION_VERIFICATION') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function buildSubmissionVerificationUpdate(session, submission, input = {}, now = new Date()) {
  if (!['admin', 'teacher'].includes(session?.role)) {
    throw verificationError('Chỉ Admin hoặc Giáo viên được xác minh bài nộp', 403, 'ADMIN_REQUIRED');
  }
  if (!submission) {
    throw verificationError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
  }
  if (typeof input.verified !== 'boolean') {
    throw verificationError('Trạng thái xác minh không hợp lệ');
  }

  const verified = input.verified;
  const note = String(input.note || '').trim().slice(0, 1000);
  if (verified && !String(submission.solutionContent || '').trim()) {
    throw verificationError('Chỉ có thể xác minh bài nộp có lời giải văn bản để AI đối chiếu');
  }

  const timestamp = now instanceof Date ? now : new Date(now);
  const verifier = String(session.username || '').slice(0, 80);
  const verifierUserId = String(session.sub || '').slice(0, 120);
  const historyEntry = {
    action: verified ? 'verified' : 'revoked', verified, note,
    by: verifier, byUserId: verifierUserId, at: timestamp
  };

  return {
    verified,
    update: {
      $set: {
        adminVerified: verified,
        adminVerifiedBy: verified ? verifier : '',
        adminVerifiedByUserId: verified ? verifierUserId : '',
        adminVerifiedAt: verified ? timestamp : null,
        adminVerificationNote: note,
        adminVerificationUpdatedAt: timestamp,
        updatedAt: timestamp
      },
      $push: { adminVerificationHistory: { $each: [historyEntry], $slice: -50 } }
    },
    historyEntry
  };
}

export function buildSubmissionContentUpdate(session, submission, input = {}, now = new Date()) {
  if (!['admin', 'teacher'].includes(session?.role)) {
    throw verificationError('Chỉ Admin hoặc Giáo viên được chỉnh sửa nội dung bài nộp', 403, 'ADMIN_REQUIRED');
  }
  if (!submission) {
    throw verificationError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
  }

  const solutionContent = String(input.solutionContent || '').trim().slice(0, 50_000);
  if (!solutionContent) {
    throw verificationError('Nội dung lời giải văn bản không được để trống', 400, 'SOLUTION_CONTENT_REQUIRED');
  }

  const timestamp = now instanceof Date ? now : new Date(now);
  const editor = String(session.username || '').slice(0, 80);
  const editorUserId = String(session.sub || '').slice(0, 120);
  const revokedVerification = submission.adminVerified === true;
  const set = {
    solutionContent,
    submissionContentEditedBy: editor,
    submissionContentEditedByUserId: editorUserId,
    submissionContentEditedAt: timestamp,
    updatedAt: timestamp
  };
  const update = { $set: set };

  if (revokedVerification) {
    const note = 'Nội dung lời giải đã được admin chỉnh sửa; cần xác minh lại.';
    Object.assign(set, {
      adminVerified: false,
      adminVerifiedBy: '',
      adminVerifiedByUserId: '',
      adminVerifiedAt: null,
      adminVerificationNote: note,
      adminVerificationUpdatedAt: timestamp
    });
    update.$push = {
      adminVerificationHistory: {
        $each: [{
          action: 'revoked', verified: false, note,
          by: editor, byUserId: editorUserId, at: timestamp
        }],
        $slice: -50
      }
    };
  }

  return { solutionContent, revokedVerification, update };
}
