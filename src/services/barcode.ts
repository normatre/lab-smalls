import type { Product } from "@/types/lab-smalls";

export type BarcodeMatch = {
  barcode: string;
  product: Product | null;
};

export interface BarcodeResolver {
  resolveBarcode(barcode: string): Promise<BarcodeMatch>;
}

export class ProductDatabaseBarcodeResolver implements BarcodeResolver {
  constructor(private products: Product[]) {}

  async resolveBarcode(barcode: string): Promise<BarcodeMatch> {
    return {
      barcode,
      product: this.products.find((product) => product.barcode === barcode) ?? null,
    };
  }
}
