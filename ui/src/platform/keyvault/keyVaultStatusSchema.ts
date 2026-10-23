// STATUS: PLATIN — validates native/loopback KeyVault status before capability projection.

export interface KeyVaultStatusPayload {
  success: boolean;
  platform: string;
  provider_name: string;
  provider_available: boolean;
  secure_persistence: boolean;
  hardware_interface_detected: boolean;
  hardware_slot_supported: boolean;
  provider_capabilities: string[];
  provider_detail: string;
  is_unlocked: boolean;
  pqc_unlocked: boolean;
  top_secret_enrolled: boolean;
  top_secret_unlocked: boolean;
  hardware_backed: boolean;
  hardware_attestation_verified: boolean;
  software_provider_configured?: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isBoundedText(value: unknown, maximumLength: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= maximumLength && (allowEmpty || value.length > 0) && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function parseKeyVaultStatusPayload(value: unknown): KeyVaultStatusPayload | null {
  if (!isPlainRecord(value)) return null;
  try {
    const softwareProviderDescriptor = Object.getOwnPropertyDescriptor(value, 'software_provider_configured');
    if (softwareProviderDescriptor &&
      (!Object.prototype.hasOwnProperty.call(softwareProviderDescriptor, 'value') || typeof softwareProviderDescriptor.value !== 'boolean')) return null;
    const requiredFields = [
      'success', 'platform', 'provider_name', 'provider_available', 'secure_persistence',
      'hardware_interface_detected', 'hardware_slot_supported', 'provider_capabilities',
      'provider_detail', 'is_unlocked', 'pqc_unlocked', 'top_secret_enrolled',
      'top_secret_unlocked', 'hardware_backed', 'hardware_attestation_verified',
    ] as const;
    for (const field of requiredFields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    }

    const capabilitiesLength = Object.getOwnPropertyDescriptor(value.provider_capabilities, 'length');
    if (typeof value.success !== 'boolean' ||
      !isBoundedText(value.platform, 32) ||
      !isBoundedText(value.provider_name, 128) ||
      typeof value.provider_available !== 'boolean' ||
      typeof value.secure_persistence !== 'boolean' ||
      typeof value.hardware_interface_detected !== 'boolean' ||
      typeof value.hardware_slot_supported !== 'boolean' ||
      typeof value.is_unlocked !== 'boolean' ||
      typeof value.pqc_unlocked !== 'boolean' ||
      typeof value.top_secret_enrolled !== 'boolean' ||
      typeof value.top_secret_unlocked !== 'boolean' ||
      typeof value.hardware_backed !== 'boolean' ||
      typeof value.hardware_attestation_verified !== 'boolean' ||
      !isBoundedText(value.provider_detail, 1_024, true) ||
      !Array.isArray(value.provider_capabilities) || !capabilitiesLength ||
      typeof capabilitiesLength.value !== 'number' || capabilitiesLength.value > 32 ||
      Object.getPrototypeOf(value.provider_capabilities) !== Array.prototype) return null;

    const providerCapabilities: string[] = [];
    for (let index = 0; index < capabilitiesLength.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value.provider_capabilities, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
      const capability: unknown = descriptor.value;
      if (!isBoundedText(capability, 96)) return null;
      providerCapabilities.push(capability);
    }

    return {
      success: value.success,
      platform: value.platform,
      provider_name: value.provider_name,
      provider_available: value.provider_available,
      secure_persistence: value.secure_persistence,
      hardware_interface_detected: value.hardware_interface_detected,
      hardware_slot_supported: value.hardware_slot_supported,
      provider_capabilities: providerCapabilities,
      provider_detail: value.provider_detail,
      is_unlocked: value.is_unlocked,
      pqc_unlocked: value.pqc_unlocked,
      top_secret_enrolled: value.top_secret_enrolled,
      top_secret_unlocked: value.top_secret_unlocked,
      hardware_backed: value.hardware_backed,
      hardware_attestation_verified: value.hardware_attestation_verified,
      software_provider_configured: softwareProviderDescriptor?.value === true,
    };
  } catch {
    return null;
  }
}
