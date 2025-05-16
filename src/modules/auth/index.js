export class AuthManager {
  constructor(userId) {
    this.userId = userId;
  }

  setUserId(userId) {
    this.userId = userId;
  }

  getUserId() {
    return this.userId;
  }

  getHeaders() {
    return {
      // 'Authorization': `Bearer ${this.userId}`
      "X-User-ID": this.userId,
    };
  }
}
