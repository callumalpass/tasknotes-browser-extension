export interface BuildTarget {
  readonly browser: "chrome" | "firefox";
  readonly mdbaseEnv: "production" | "lab";
  readonly devKey: boolean;
}

export const mdbaseEnvironments: Record<
  BuildTarget["mdbaseEnv"],
  { readonly connectUrl: string; readonly logUrl: string; readonly appUrl: string; readonly sdkPackage: string }
>;
export function buildTarget(environment?: Record<string, string | undefined>): BuildTarget;
export function mdbaseSupported(target: BuildTarget): boolean;
export function manifestVersion(version?: string): { version: string; version_name?: string };
export function mdbaseAppManifest(target: BuildTarget): Record<string, unknown>;
export function extensionManifest(target: BuildTarget): Record<string, unknown> & {
  readonly permissions: string[];
  readonly host_permissions: string[];
};
