/**
 * Connection Manager for xComfort Bridge
 *
 * Handles WebSocket lifecycle:
 * - Connection establishment
 * - Reconnection with backoff
 * - Heartbeat management
 * - Message sending/receiving
 *
 * Extracted from XComfortConnection for single responsibility.
 */

import WebSocket from 'ws';
import crypto from 'node:crypto';
import { PROTOCOL_CONFIG } from '../XComfortProtocol.mjs';
import type { ConnectionState, EncryptionContext } from '../types.mjs';

// Re-export types for module consumers
export type { ConnectionState, EncryptionContext };

// ============================================================================
// Retry Configuration
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  ackTimeout: number; // ms to wait for ACK before retry
  retryDelay: number; // ms between retries
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  ackTimeout: 5000, // 5 seconds
  retryDelay: 500,  // 500ms between retries
};

// ============================================================================
// Module-specific Types (callbacks)
// ============================================================================

/** Callback for raw message received */
export type OnRawMessageFn = (data: Buffer, timestamp: number) => void;

/** Callback for connection state change */
export type OnStateChangeFn = (state: ConnectionState) => void;

/** Callback for connection close */
export type OnCloseFn = (code: number, reason: string, shouldReconnect: boolean) => void;

// ============================================================================
// ConnectionManager Class
// ============================================================================

export class ConnectionManager {
  private bridgeIp: string;
  private ws: WebSocket | null = null;
  private encryptionContext: EncryptionContext | null = null;
  private state: ConnectionState = 'disconnected';
  private connectionEstablished: boolean = false;
  private reconnecting: boolean = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private mc: number = 0;

  private onRawMessage?: OnRawMessageFn;
  private onStateChange?: OnStateChangeFn;
  private onClose?: OnCloseFn;

  private base64regex: RegExp = /^[A-Za-z0-9+/=]+$/;

  // Retry mechanism: Map of mc -> resolve function for pending ACKs
  private pendingAcks: Map<number, (acked: boolean) => void> = new Map();
  private retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;

  constructor(bridgeIp: string) {
    this.bridgeIp = bridgeIp;
  }

  /**
   * Configure retry behavior
   */
  setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * Set callback for raw messages
   */
  setOnRawMessage(callback: OnRawMessageFn): void {
    this.onRawMessage = callback;
  }

  /**
   * Set callback for state changes
   */
  setOnStateChange(callback: OnStateChangeFn): void {
    this.onStateChange = callback;
  }

  /**
   * Set callback for connection close
   */
  setOnClose(callback: OnCloseFn): void {
    this.onClose = callback;
  }

  /**
   * Set encryption context after key exchange
   */
  setEncryptionContext(context: EncryptionContext): void {
    this.encryptionContext = context;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected and ready
   */
  isConnected(): boolean {
    return !!(
      this.encryptionContext &&
      this.ws &&
      this.ws.readyState === WebSocket.OPEN
    );
  }

  /**
   * Mark connection as established (for reconnection logic)
   */
  markEstablished(): void {
    this.connectionEstablished = true;
  }

  /**
   * Get next message counter value
   */
  nextMc(): number {
    return ++this.mc;
  }

  /**
   * Reset message counter
   */
  resetMc(): void {
    this.mc = 0;
  }

  /**
   * Connect to the bridge
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.state = 'connecting';
        this.onStateChange?.(this.state);

        this.ws = new WebSocket(`ws://${this.bridgeIp}`, {
          perMessageDeflate: false,
        });

        this.ws.on('open', () => {
          console.log('[ConnectionManager] WebSocket connected, awaiting handshake...');

          // Set TCP_NODELAY
          const socket = (this.ws as unknown as { _socket?: { setNoDelay: (v: boolean) => void } })._socket;
          if (socket) {
            socket.setNoDelay(true);
          }
        });

        this.ws.on('message', (data: Buffer) => {
          const rawRecvTime = Date.now();
          console.log(
            `[ConnectionManager] RAW MSG at ${rawRecvTime}, size=${data.length}`
          );
          this.onRawMessage?.(data, rawRecvTime);
        });

        this.ws.on('error', (err: Error) => {
          console.error('[ConnectionManager] WebSocket error:', err);
          reject(err);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          const reasonStr = reason.toString() || 'No reason';
          console.log(
            `[ConnectionManager] Connection closed. Code: ${code}, Reason: ${reasonStr}`
          );

          const wasEstablished = this.connectionEstablished;
          const shouldReconnect = wasEstablished && !this.reconnecting;

          this.state = 'disconnected';
          this.onStateChange?.(this.state);
          this.onClose?.(code, reasonStr, shouldReconnect);
        });

        // Resolve is called externally when auth completes
        // Store resolve/reject for external completion
        (this as unknown as { _connectResolve: () => void })._connectResolve = resolve;
        (this as unknown as { _connectReject: (err: Error) => void })._connectReject = reject;

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Resolve the connection promise (called when auth completes)
   */
  resolveConnection(): void {
    const resolve = (this as unknown as { _connectResolve?: () => void })._connectResolve;
    if (resolve) {
      this.state = 'connected';
      this.onStateChange?.(this.state);
      resolve();
      delete (this as unknown as { _connectResolve?: () => void })._connectResolve;
    }
  }

  /**
   * Reject the connection promise
   */
  rejectConnection(error: Error): void {
    const reject = (this as unknown as { _connectReject?: (err: Error) => void })._connectReject;
    if (reject) {
      reject(error);
      delete (this as unknown as { _connectReject?: (err: Error) => void })._connectReject;
    }
  }

  /**
   * Send raw (unencrypted) message
   */
  sendRaw(data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[ConnectionManager] Cannot send - WebSocket not open');
      return;
    }
    this.ws.send(data);
  }

  /**
   * Send encrypted message
   */
  sendEncrypted(jsonObj: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[ConnectionManager] Cannot send message - WebSocket not open');
      return false;
    }

    if (!this.encryptionContext) {
      console.error('[ConnectionManager] Cannot send - no encryption context');
      return false;
    }

    try {
      const data = this.encryptMessage(jsonObj);
      console.log(
        `[ConnectionManager] SEND type=${jsonObj.type_int} mc=${jsonObj.mc ?? 'N/A'}`
      );
      this.ws.send(data);
      return true;
    } catch (error) {
      console.error('[ConnectionManager] Failed to send encrypted message:', error);
      return false;
    }
  }

  /**
   * Send encrypted message with callback
   */
  sendEncryptedAsync(jsonObj: Record<string, unknown>): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }

      if (!this.encryptionContext) {
        reject(new Error('No encryption context'));
        return;
      }

      try {
        const data = this.encryptMessage(jsonObj);
        this.ws.send(data, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send encrypted message with retry on failure or ACK timeout.
   * Retries up to maxRetries times if ACK is not received within ackTimeout.
   */
  async sendWithRetry(jsonObj: Record<string, unknown>): Promise<boolean> {
    const mc = jsonObj.mc as number | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      if (attempt > 0) {
        console.log(`[ConnectionManager] Retry ${attempt}/${this.retryConfig.maxRetries} for mc=${mc}`);
        await this.delay(this.retryConfig.retryDelay);
      }

      if (!this.isConnected()) {
        console.error(`[ConnectionManager] Cannot send mc=${mc} - not connected`);
        continue;
      }

      const sent = this.sendEncrypted(jsonObj);
      if (!sent) continue;

      // If no mc, no ACK expected - return success
      if (mc === undefined) return true;

      // Wait for ACK with timeout
      const acked = await this.waitForAck(mc, this.retryConfig.ackTimeout);
      if (acked) return true;

      console.log(`[ConnectionManager] ACK timeout for mc=${mc}`);
    }

    console.error(`[ConnectionManager] Failed to send mc=${mc} after ${this.retryConfig.maxRetries} retries`);
    return false;
  }

  /**
   * Wait for ACK for a specific message counter
   */
  private waitForAck(mc: number, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pendingAcks.delete(mc);
        resolve(false);
      }, timeout);

      this.pendingAcks.set(mc, (acked: boolean) => {
        clearTimeout(timeoutId);
        resolve(acked);
      });
    });
  }

  /**
   * Called when ACK is received - resolves the pending promise
   */
  handleAck(ref: number): void {
    const resolve = this.pendingAcks.get(ref);
    if (resolve) {
      this.pendingAcks.delete(ref);
      resolve(true);
    }
  }

  /**
   * Called when NACK is received - resolves as failed to trigger retry
   */
  handleNack(ref: number): void {
    const resolve = this.pendingAcks.get(ref);
    if (resolve) {
      this.pendingAcks.delete(ref);
      resolve(false);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Encrypt a message using AES-256-CBC
   */
  private encryptMessage(jsonObj: Record<string, unknown>): string {
    if (!this.encryptionContext) {
      throw new Error('Encryption keys not initialized');
    }

    const msgStr = JSON.stringify(jsonObj);
    const padded = this.padToBlockSize(msgStr);

    const cipher = crypto.createCipheriv(
      PROTOCOL_CONFIG.ENCRYPTION.ALGORITHM,
      this.encryptionContext.key,
      this.encryptionContext.iv
    );
    cipher.setAutoPadding(false);

    let encrypted = cipher.update(padded);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return encrypted.toString('base64') + '\u0004';
  }

  /**
   * Decrypt a message using AES-256-CBC
   */
  decryptMessage(rawStr: string): string {
    if (!this.encryptionContext) {
      throw new Error('Decryption keys not initialized');
    }

    let encryptedBuf = Buffer.from(rawStr, 'base64');
    const paddedLength = Math.ceil(encryptedBuf.length / 16) * 16;

    if (encryptedBuf.length < paddedLength) {
      const oldBuf = encryptedBuf;
      encryptedBuf = Buffer.alloc(paddedLength, 0);
      oldBuf.copy(encryptedBuf);
    }

    const decipher = crypto.createDecipheriv(
      PROTOCOL_CONFIG.ENCRYPTION.ALGORITHM,
      this.encryptionContext.key,
      this.encryptionContext.iv
    );
    decipher.setAutoPadding(false);

    const decrypted = Buffer.concat([
      decipher.update(encryptedBuf),
      decipher.final(),
    ]);

    return decrypted.toString('utf8').replace(/\x00+$/, '');
  }

  /**
   * Check if string looks like encrypted (base64) data
   */
  isEncrypted(rawStr: string): boolean {
    return this.base64regex.test(rawStr);
  }

  /**
   * Pad message to AES block size
   */
  private padToBlockSize(str: string): Buffer {
    const buf = Buffer.from(str, 'utf8');
    const blockSize = PROTOCOL_CONFIG.ENCRYPTION.BLOCK_SIZE;
    const pad = blockSize - (buf.length % blockSize);
    const padded = Buffer.alloc(buf.length + pad, 0);
    buf.copy(padded);
    return padded;
  }

  /**
   * Start heartbeat interval
   */
  startHeartbeat(sendHeartbeat: () => void): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        sendHeartbeat();
      }
    }, PROTOCOL_CONFIG.TIMEOUTS.HEARTBEAT);
  }

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Close connection and cleanup
   */
  cleanup(): void {
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    this.encryptionContext = null;
    this.state = 'disconnected';
    this.connectionEstablished = false;
    this.reconnecting = false;
    this.mc = 0;
  }

  /**
   * Mark as reconnecting (to prevent duplicate reconnect attempts)
   */
  setReconnecting(value: boolean): void {
    this.reconnecting = value;
  }

  /**
   * Check if currently reconnecting
   */
  isReconnecting(): boolean {
    return this.reconnecting;
  }
}
