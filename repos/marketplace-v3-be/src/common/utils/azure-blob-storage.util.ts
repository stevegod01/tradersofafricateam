import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from '@azure/identity';
import {
  BlobServiceClient,
  type BlockBlobClient,
} from '@azure/storage-blob';
import { config } from '../../config';

type AzureUploadInput = {
  blobName: string;
  buffer: Buffer;
  contentType: string;
};

let serviceClient: BlobServiceClient | undefined;

function credential(): TokenCredential {
  return config.isProd
    ? new ManagedIdentityCredential()
    : new DefaultAzureCredential();
}

function getServiceClient(): BlobServiceClient {
  if (!serviceClient) {
    serviceClient = new BlobServiceClient(
      `https://${config.storage.accountName}.blob.core.windows.net`,
      credential(),
    );
  }
  return serviceClient;
}

function blockBlob(blobName: string): BlockBlobClient {
  return getServiceClient()
    .getContainerClient(config.storage.containerName)
    .getBlockBlobClient(blobName);
}

export async function uploadBufferToAzureBlob(
  input: AzureUploadInput,
): Promise<{ url: string }> {
  await blockBlob(input.blobName).uploadData(input.buffer, {
    blobHTTPHeaders: { blobContentType: input.contentType },
    conditions: { ifNoneMatch: '*' },
  });

  return { url: `/api/uploads/${encodeBlobPath(input.blobName)}` };
}

export async function downloadPrivateBlob(blobName: string) {
  return blockBlob(blobName).download();
}

export async function deletePrivateBlob(blobName: string): Promise<void> {
  await blockBlob(blobName).deleteIfExists({ deleteSnapshots: 'include' });
}

function encodeBlobPath(blobName: string): string {
  return blobName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
