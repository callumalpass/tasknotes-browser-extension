export interface WebstoreStatus {
  readonly itemId?: string;
  readonly takenDown?: boolean;
  readonly warned?: boolean;
  readonly lastAsyncUploadState?: string;
  readonly submittedItemRevisionStatus?: { readonly state?: string };
  readonly publishedItemRevisionStatus?: { readonly distributionChannels?: readonly { readonly crxVersion: string }[] };
}

export function compareVersions(a: string, b: string): number;
export function releaseVersion(
  tag: string | undefined,
  manifest: { readonly version: string; readonly manifest_version: number; readonly key?: string },
): string;
export function checkStatus(status: WebstoreStatus, itemId: string, version: string): void;
export function publish(options: {
  readonly publisherId: string | undefined;
  readonly itemId: string | undefined;
  readonly token: string | undefined;
  readonly version: string;
  readonly archive: Uint8Array;
  readonly fetchImpl?: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
}): Promise<string>;
