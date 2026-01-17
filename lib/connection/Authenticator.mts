/**
 * Authenticator for xComfort Bridge
 *
 * Handles the multi-step authentication flow:
 * 1. Connection start/confirm
 * 2. Public key exchange
 * 3. Secret (AES keys) exchange
 * 4. Login with hashed credentials
 * 5. Token apply and renewal
 *
 * Extracted from XComfortConnection for single responsibility.
 */

import crypto from 'node:crypto';
import forge from 'node-forge';
import { MESSAGE_TYPES, CLIENT_CONFIG, PROTOCOL_CONFIG } from '../XComfortProtocol.mjs';
import { authHash, generateSalt } from '../crypto/Hash.mjs';
import type { ProtocolMessage, AuthState, EncryptionContext } from '../types.mjs';

// Re-export types for module consumers
export type { AuthState, EncryptionContext };

// ============================================================================
// Module-specific Types (callbacks)
// ============================================================================

/** Callback for sending raw (unencrypted) messages */
export type SendRawFn = (msg: string) => void;

/** Callback for sending encrypted messages */
export type SendEncryptedFn = (msg: Record<string, unknown>) => boolean;

/** Callback when authentication completes */
export type OnAuthenticatedFn = () => void;

/** Message counter getter */
export type GetMcFn = () => number;

// ============================================================================
// Authenticator Class
// ============================================================================

export class Authenticator {
  private authKey: string;
  private deviceId: string | null = null;
  private connectionId: string | null = null;
  private publicKey: forge.pki.rsa.PublicKey | null = null;
  private encryptionContext: EncryptionContext | null = null;
  private token: string | null = null;
  private state: AuthState = 'idle';
  private isRenewing: boolean = false;

  private sendRaw: SendRawFn;
  private sendEncrypted: SendEncryptedFn;
  private getMc: GetMcFn;
  private onAuthenticated?: OnAuthenticatedFn;

  constructor(
    authKey: string,
    sendRaw: SendRawFn,
    sendEncrypted: SendEncryptedFn,
    getMc: GetMcFn
  ) {
    this.authKey = authKey;
    this.sendRaw = sendRaw;
    this.sendEncrypted = sendEncrypted;
    this.getMc = getMc;
  }

  /**
   * Set callback for when authentication completes
   */
  setOnAuthenticated(callback: OnAuthenticatedFn): void {
    this.onAuthenticated = callback;
  }

  /**
   * Get current authentication state
   */
  getState(): AuthState {
    return this.state;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.state === 'authenticated';
  }

  /**
   * Get the device ID from the bridge
   */
  getDeviceId(): string | null {
    return this.deviceId;
  }

  /**
   * Get the encryption context (key and IV)
   */
  getEncryptionContext(): EncryptionContext | null {
    return this.encryptionContext;
  }

  /**
   * Reset authentication state
   */
  reset(): void {
    this.deviceId = null;
    this.connectionId = null;
    this.publicKey = null;
    this.encryptionContext = null;
    this.token = null;
    this.state = 'idle';
    this.isRenewing = false;
  }

  /**
   * Handle unencrypted handshake messages
   * Returns true if the message was handled
   */
  handleUnencryptedMessage(msg: ProtocolMessage): boolean {
    if (msg.type_int === MESSAGE_TYPES.CONNECTION_START) {
      const payload = msg.payload as { device_id: string; connection_id: string };
      this.deviceId = payload.device_id;
      this.connectionId = payload.connection_id;
      this.state = 'awaiting_public_key';
      console.log(
        `[Authenticator] CONNECTION_START received. deviceId=${this.deviceId}`
      );

      const confirmMsg = {
        type_int: MESSAGE_TYPES.CONNECTION_CONFIRM,
        mc: this.getMc(),
        payload: {
          client_type: CLIENT_CONFIG.TYPE,
          client_id: CLIENT_CONFIG.ID,
          client_version: CLIENT_CONFIG.VERSION,
          connection_id: this.connectionId,
        },
      };
      this.sendRaw(JSON.stringify(confirmMsg));
      console.log('[Authenticator] Sent CONNECTION_CONFIRM');
      return true;
    }

    if (msg.type_int === MESSAGE_TYPES.SC_INIT_RESPONSE) {
      const initMsg = { type_int: MESSAGE_TYPES.SC_INIT_REQUEST, mc: this.getMc() };
      this.sendRaw(JSON.stringify(initMsg));
      console.log('[Authenticator] Sent SC_INIT');
      return true;
    }

    if (msg.type_int === MESSAGE_TYPES.SC_INIT_REQUEST) {
      const initMsg = { type_int: MESSAGE_TYPES.SC_INIT_REQUEST, mc: this.getMc() };
      this.sendRaw(JSON.stringify(initMsg));
      console.log('[Authenticator] Requested public key');
      return true;
    }

    if (msg.type_int === MESSAGE_TYPES.PUBLIC_KEY_RESPONSE) {
      const payload = msg.payload as { public_key: string };
      this.publicKey = forge.pki.publicKeyFromPem(payload.public_key);
      console.log('[Authenticator] Received public key');

      // Generate AES key and IV
      this.encryptionContext = {
        key: crypto.randomBytes(PROTOCOL_CONFIG.ENCRYPTION.KEY_SIZE),
        iv: crypto.randomBytes(PROTOCOL_CONFIG.ENCRYPTION.IV_SIZE),
      };

      const secretStr =
        this.encryptionContext.key.toString('hex') +
        ':::' +
        this.encryptionContext.iv.toString('hex');

      const encrypted = this.publicKey.encrypt(
        secretStr,
        PROTOCOL_CONFIG.ENCRYPTION.RSA_SCHEME
      );
      const secret = Buffer.from(encrypted, 'binary').toString('base64');

      const secretMsg = {
        type_int: MESSAGE_TYPES.SECRET_EXCHANGE,
        mc: this.getMc(),
        payload: { secret },
      };
      this.sendRaw(JSON.stringify(secretMsg));
      this.state = 'awaiting_secret_ack';
      console.log('[Authenticator] Sent encrypted AES keys');
      return true;
    }

    return false;
  }

  /**
   * Handle encrypted authentication messages
   * Returns true if the message was handled
   */
  handleEncryptedMessage(msg: ProtocolMessage): boolean {
    if (msg.type_int === MESSAGE_TYPES.SECRET_EXCHANGE_ACK) {
      const salt = generateSalt(PROTOCOL_CONFIG.LIMITS.SALT_LENGTH);
      const password = authHash(this.deviceId!, this.authKey, salt);

      const loginMsg = {
        type_int: MESSAGE_TYPES.LOGIN_REQUEST,
        mc: this.getMc(),
        payload: {
          username: 'default',
          password: password,
          salt: salt,
        },
      };
      this.sendEncrypted(loginMsg);
      this.state = 'awaiting_login_response';
      console.log('[Authenticator] Sent login');
      return true;
    }

    if (msg.type_int === MESSAGE_TYPES.LOGIN_RESPONSE) {
      const payload = msg.payload as { token: string };
      this.token = payload.token;
      console.log('[Authenticator] Login successful, received token');

      const applyTokenMsg = {
        type_int: MESSAGE_TYPES.TOKEN_APPLY,
        mc: this.getMc(),
        payload: { token: this.token },
      };
      this.sendEncrypted(applyTokenMsg);
      this.state = 'awaiting_token_apply';
      return true;
    }

    if (msg.type_int === MESSAGE_TYPES.TOKEN_APPLY_ACK) {
      if (!this.isRenewing) {
        console.log('[Authenticator] Token applied, renewing token...');
        this.isRenewing = true;

        const renewTokenMsg = {
          type_int: MESSAGE_TYPES.TOKEN_RENEW,
          mc: this.getMc(),
          payload: { token: this.token },
        };
        this.sendEncrypted(renewTokenMsg);
        this.state = 'awaiting_token_renew';
      } else {
        console.log('[Authenticator] Fully authenticated with renewed token!');
        this.state = 'authenticated';
        this.isRenewing = false;
        this.onAuthenticated?.();
      }
      return true;
    }

    if (msg.type_int === MESSAGE_TYPES.TOKEN_RENEW_RESPONSE) {
      const payload = msg.payload as { token: string };
      this.token = payload.token;
      console.log('[Authenticator] Token renewed, applying new token...');

      const applyNewTokenMsg = {
        type_int: MESSAGE_TYPES.TOKEN_APPLY,
        mc: this.getMc(),
        payload: { token: this.token },
      };
      this.sendEncrypted(applyNewTokenMsg);
      return true;
    }

    return false;
  }
}
