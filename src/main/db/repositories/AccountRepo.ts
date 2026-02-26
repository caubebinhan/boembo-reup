import { BaseRepo } from './BaseRepo'
import type { AccountDocument } from '../models/Account'

export class AccountRepository extends BaseRepo<AccountDocument> {
  constructor() {
    super('publish_accounts')
  }

  findByPlatform(platform: string): AccountDocument[] {
    return this.findAll().filter(a => a.platform === platform)
  }
}

export const accountRepo = new AccountRepository()
