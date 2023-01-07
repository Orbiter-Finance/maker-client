
import { ethers } from "ethers";
import { TransactionResponse } from "./baseAccount";

export class NonceManager extends ethers.Signer {
    readonly signer!: ethers.Signer;
    _deltaCount: number;
    
    constructor(signer: ethers.Signer) {
        super();
        this._deltaCount = 0;
        ethers.utils.defineReadOnly(this, "signer", signer);
        ethers.utils.defineReadOnly(this, "provider", signer.provider);
    }

    connect(provider: ethers.providers.Provider): NonceManager {
        return new NonceManager(this.signer.connect(provider));
    }


    getAddress(): Promise<string> {
        return this.signer.getAddress();
    }

    incrementTransactionCount(count?: number): void {
        this._deltaCount += ((count == null) ? 1 : count);
    }

    signMessage(message: ethers.Bytes | string): Promise<string> {
        return this.signer.signMessage(message);;
    }

    signTransaction(transaction: ethers.utils.Deferrable<ethers.providers.TransactionRequest>): Promise<string> {
        return this.signer.signTransaction(transaction);
    }

    async sendTransaction(transaction: ethers.utils.Deferrable<ethers.providers.TransactionRequest>): Promise<TransactionResponse> {
        const nonce = await this.getTransactionCount("pending");

        if (!this._deltaCount || ethers.BigNumber.from(nonce).gt(this._deltaCount)) {
            transaction = ethers.utils.shallowCopy(transaction);
            this._deltaCount = nonce - 1;
        }
        this.incrementTransactionCount();
        transaction.nonce = this._deltaCount;
        try {
            console.info(`nonceManager sendTransaction before:`, transaction);
            const tx = await this.signer.sendTransaction(transaction);
            return tx;
        } catch (error) {
            this._deltaCount -= 1;
            throw error;
        }
    }
}
