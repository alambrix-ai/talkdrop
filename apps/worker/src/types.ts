export interface StorageLike {
  deleteObject(key: string): Promise<void>;
}
