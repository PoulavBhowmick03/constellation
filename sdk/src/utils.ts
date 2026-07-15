import { formatUnits as viemFormatUnits, getAddress, type Address } from "viem";

const DEFAULT_USDC_DECIMALS = 6;

export function formatTokenAmount(amount: bigint | string | number, decimals: number = DEFAULT_USDC_DECIMALS): string {
  return viemFormatUnits(BigInt(amount), decimals);
}

export function checksumAddress(address: string): Address {
  return getAddress(address);
}

export function buildQuery(record: Record<string, string | number | boolean>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    params.set(key, String(value));
  }
  return params.toString();
}

export function explorerTxUrl(txHash: string, explorerBase: string): string {
  return `${explorerBase.replace(/\/$/, "")}/tx/${txHash}`;
}

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDe: 18,
};

export function decimalsForSymbol(symbol: string): number {
  return TOKEN_DECIMALS[symbol] ?? DEFAULT_USDC_DECIMALS;
}

export function isValidPaymentToken(token: string, paymentTokens: Record<string, Address>): boolean {
  const checksummed = getAddress(token);
  return Object.values(paymentTokens).some((addr) => getAddress(addr) === checksummed);
}

export class LedgerForgeError extends Error {
  readonly code: string;
  readonly cause?: unknown;
  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "LedgerForgeError";
    this.code = code;
    this.cause = cause;
  }
}
