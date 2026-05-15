/**
 * Tiny S3 facade. Production deployments should swap NoOpS3 for an aws-sdk
 * implementation that uploads with `ObjectLockMode: 'COMPLIANCE'`. This
 * file deliberately keeps the SDK out of the dependency graph for now.
 */

export interface S3Driver {
  putWithObjectLock(key: string, body: string | Buffer): Promise<void>;
}

export class NoOpS3 implements S3Driver {
  async putWithObjectLock(key: string, body: string | Buffer): Promise<void> {
    // In dev / when S3_BUCKET is unset.
    void key;
    void body;
    await Promise.resolve();
  }
}

export function makeS3(env: { S3_BUCKET?: string | undefined }): S3Driver {
  if (!env.S3_BUCKET) {
    return new NoOpS3();
  }
  // Production wires up @aws-sdk/client-s3 here.
  return new NoOpS3();
}
