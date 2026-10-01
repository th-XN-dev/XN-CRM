import { Injectable, type OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Argon2id (OWASP recommended). Hash parameters are embedded in the hash itself. */
@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    // Used to spend the same time on unknown logins as on wrong passwords (anti user-enumeration).
    this.dummyHash = await argon2.hash('xn-crm-timing-equalizer', { type: argon2.argon2id });
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    try {
      const ok = await argon2.verify(hash ?? this.dummyHash, password);
      return hash ? ok : false;
    } catch {
      return false;
    }
  }
}
