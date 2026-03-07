/**
 * System Configuration Service
 * 
 * Helper service for accessing system configuration values
 * Provides typed accessors for common configuration types
 */

import { api } from './api';

/** Validation mode: off = no validation; before_save = validate only on save; online = validate as user types/blur */
export type ValidationMode = 'off' | 'before_save' | 'online';

/** Theme identifiers. ocean = deep teal/blue; mist = lighter slate, airy. */
export type ThemeId = 'ocean' | 'mist';

export interface UIConfig {
  validation_rules_enabled: boolean;
  /** When to run validation. Default: before_save */
  validation_mode?: ValidationMode;
  /** Active theme. Default: ocean */
  theme_id?: ThemeId;
}

export interface EmailConfig {
  smtp_host?: string;
  smtp_port?: number;
  smtp_encryption?: 'tls' | 'ssl' | 'none';
  smtp_username?: string;
  smtp_password?: string;
  from_email?: string;
  from_name?: string;
  reply_to_email?: string;
  max_retries?: number;
  timeout_seconds?: number;
}

export interface MailConfig {
  mailing_list_enabled?: boolean;
  auto_send_emails?: boolean;
  default_subject_template?: string;
  default_body_template?: string;
  send_interval_minutes?: number;
  max_recipients_per_batch?: number;
}

class SystemConfigService {
  private uiConfigCache: UIConfig | null = null;
  private emailConfigCache: EmailConfig | null = null;
  private mailConfigCache: MailConfig | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get UI configuration
   */
  async getUIConfig(): Promise<UIConfig> {
    const now = Date.now();
    if (this.uiConfigCache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.uiConfigCache;
    }

    try {
      const config = await api.systemConfiguration.getUIConfig();
      this.uiConfigCache = config;
      this.cacheTimestamp = now;
      return config;
    } catch (error) {
      console.error('Error loading UI config:', error);
      return { validation_rules_enabled: false, validation_mode: 'before_save' };
    }
  }

  /**
   * Get Email configuration
   */
  async getEmailConfig(): Promise<EmailConfig | null> {
    const now = Date.now();
    if (this.emailConfigCache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.emailConfigCache;
    }

    try {
      const config = await api.systemConfiguration.getEmailConfig();
      this.emailConfigCache = config;
      this.cacheTimestamp = now;
      return config;
    } catch (error) {
      console.error('Error loading email config:', error);
      return null;
    }
  }

  /**
   * Get Mail configuration
   */
  async getMailConfig(): Promise<MailConfig | null> {
    const now = Date.now();
    if (this.mailConfigCache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.mailConfigCache;
    }

    try {
      const config = await api.systemConfiguration.getMailConfig();
      this.mailConfigCache = config;
      this.cacheTimestamp = now;
      return config;
    } catch (error) {
      console.error('Error loading mail config:', error);
      return null;
    }
  }

  /**
   * Get a configuration value by name
   */
  async getConfigValue(name: string): Promise<string | null> {
    try {
      const config = await api.systemConfiguration.getByName(name);
      return config?.value || null;
    } catch (error) {
      console.error(`Error loading config ${name}:`, error);
      return null;
    }
  }

  /**
   * Get a configuration value parsed as JSON
   */
  async getConfigValueAsJson<T = any>(name: string): Promise<T | null> {
    try {
      const value = await this.getConfigValue(name);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Error parsing config ${name} as JSON:`, error);
      return null;
    }
  }

  /**
   * Set a configuration value
   */
  async setConfigValue(name: string, value: string, description?: string): Promise<void> {
    try {
      await api.systemConfiguration.upsert(name, value, description);
      // Clear caches
      this.clearCache();
    } catch (error) {
      console.error(`Error setting config ${name}:`, error);
      throw error;
    }
  }

  /**
   * Set a configuration value as JSON
   */
  async setConfigValueAsJson(name: string, value: any, description?: string): Promise<void> {
    await this.setConfigValue(name, JSON.stringify(value), description);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.uiConfigCache = null;
    this.emailConfigCache = null;
    this.mailConfigCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Check if validation rules are enabled (validation_mode !== 'off')
   */
  async isValidationRulesEnabled(): Promise<boolean> {
    const uiConfig = await this.getUIConfig();
    return uiConfig.validation_rules_enabled;
  }

  /**
   * Get validation mode: off | before_save | online
   */
  async getValidationMode(): Promise<ValidationMode> {
    const uiConfig = await this.getUIConfig();
    return uiConfig.validation_mode ?? 'before_save';
  }

  /**
   * Check if mailing list is enabled
   */
  async isMailingListEnabled(): Promise<boolean> {
    const mailConfig = await this.getMailConfig();
    return mailConfig?.mailing_list_enabled ?? false;
  }

  /**
   * Check if auto-send emails is enabled
   */
  async isAutoSendEmailsEnabled(): Promise<boolean> {
    const mailConfig = await this.getMailConfig();
    return mailConfig?.auto_send_emails ?? false;
  }
}

export const systemConfigService = new SystemConfigService();
