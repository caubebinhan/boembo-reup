export class PublishAccountService {
  static getAccount(id: string) {
    return {
      id,
      username: 'mock_user',
      session_status: 'active',
      cookies: []
    }
  }
}
