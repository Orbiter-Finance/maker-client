export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionError";
  }
}

export class NetworkError extends TransactionError {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}
export class TransactionFailedError extends TransactionError {
  constructor(message: string) {
    super(message);
    this.name = "TransactionFailedError";
  }
}
export class TransactionSendBeforeError extends TransactionError {
  constructor(message: string) {
    super(message);
    this.name = "TransactionSendBeforeError";
  }
}
export class TransactionSendAfterError extends TransactionError {
  constructor(message: string) {
    super(message);
    this.name = "TransactionSendAfterError";
  }
}

export class TransactionSendIgError extends TransactionError {
  constructor(message: string) {
    super(message);
    this.name = "TransactionIgError";
  }
}
