import fs from 'fs';
import path from 'path';
import {
  Environment,
  SignedDataVerifier,
  Type,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import { tierForAppleProductId, type SubscriptionTier } from './subscription';

const BUNDLE_ID = 'com.mindness.app';
const APP_APPLE_ID = 6809869846;

export type VerifiedAppleSubscription = {
  tier: Exclude<SubscriptionTier, 'free'>;
  productId: string;
  originalTransactionId: string;
  expiresAt: string;
  appAccountToken: string | null;
};

function loadRootCertificates(): Buffer[] {
  const dir = path.join(process.cwd(), 'certs');
  return ['AppleRootCA-G3.cer', 'AppleRootCA-G2.cer'].map((name) =>
    fs.readFileSync(path.join(dir, name)),
  );
}

const verifiers = new Map<Environment, SignedDataVerifier>();
let rootCertificates: Buffer[] | null = null;

function verifierFor(environment: Environment): SignedDataVerifier {
  const existing = verifiers.get(environment);
  if (existing) return existing;

  rootCertificates ??= loadRootCertificates();
  const created = new SignedDataVerifier(
    rootCertificates,
    true,
    environment,
    BUNDLE_ID,
    environment === Environment.PRODUCTION ? APP_APPLE_ID : undefined,
  );
  verifiers.set(environment, created);
  return created;
}

function peekEnvironment(signedTransaction: string): Environment {
  const segment = signedTransaction.split('.')[1];
  if (!segment) {
    throw new Error('Invalid Apple transaction');
  }

  const payload = JSON.parse(
    Buffer.from(segment, 'base64url').toString('utf8'),
  ) as { environment?: string };

  if (
    payload.environment === Environment.SANDBOX ||
    payload.environment === Environment.PRODUCTION ||
    payload.environment === Environment.XCODE ||
    payload.environment === Environment.LOCAL_TESTING
  ) {
    return payload.environment;
  }

  throw new Error('Unsupported Apple transaction environment');
}

function assertMindnessSubscription(
  decoded: JWSTransactionDecodedPayload,
): VerifiedAppleSubscription {
  if (decoded.bundleId && decoded.bundleId !== BUNDLE_ID) {
    throw new Error('Transaction is for a different app');
  }
  if (decoded.type && decoded.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION) {
    throw new Error('Transaction is not a subscription');
  }

  const productId = decoded.productId ?? '';
  const tier = tierForAppleProductId(productId);
  if (!tier) {
    throw new Error('Unknown subscription product');
  }
  if (decoded.revocationDate) {
    throw new Error('Subscription was revoked');
  }
  if (!decoded.expiresDate || decoded.expiresDate <= Date.now()) {
    throw new Error('Subscription is not active');
  }
  if (!decoded.originalTransactionId) {
    throw new Error('Missing transaction id');
  }

  return {
    tier,
    productId,
    originalTransactionId: decoded.originalTransactionId,
    expiresAt: new Date(decoded.expiresDate).toISOString(),
    appAccountToken: decoded.appAccountToken ?? null,
  };
}

export async function verifyAppleSubscription(
  signedTransaction: string,
): Promise<VerifiedAppleSubscription> {
  const environment = peekEnvironment(signedTransaction);
  const decoded = await verifierFor(environment).verifyAndDecodeTransaction(signedTransaction);
  return assertMindnessSubscription(decoded);
}
