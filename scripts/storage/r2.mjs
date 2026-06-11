import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream } from "node:fs";

export function createR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    maxAttempts: 5,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

export async function ensureR2Bucket(client, bucketName) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return;
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  await client.send(new CreateBucketCommand({ Bucket: bucketName }));
}

export async function uploadR2File(client, bucketName, objectKey, localPath, contentType) {
  const upload = new Upload({
    client,
    queueSize: 2,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false,
    params: {
      Bucket: bucketName,
      Key: objectKey,
      Body: createReadStream(localPath),
      ContentType: contentType
    }
  });

  await upload.done();
}

function isNotFoundError(error) {
  const status = error?.$metadata?.httpStatusCode;
  return status === 404 || error?.name === "NotFound" || error?.name === "NoSuchBucket";
}
