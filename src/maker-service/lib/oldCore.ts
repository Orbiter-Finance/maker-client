/* eslint-disable */
import { BigNumber } from "bignumber.js";

const MAX_BITS: { [key: number]: number } = {
    3: 35,
    33: 35,
    8: 28,
    88: 28,
    11: 28,
    511: 28,
    12: 35,
    512: 36,
    // eth: 256,
    // arbitrum: 256,
    // zksync: 35,
    // zksync2: 256,
    // starknet: 256,
    // polygon: 256,
    // optimism: 256,
    // immutablex: 28,
    // loopring: 256,
    // metis: 256,
    // dydx: 28,
    // boba: 256,
    // zkspace: 35,
    // bnbchain: 256,
    // arbitrum_nova: 256,
    // polygon_zkevm: 256,
    // scroll_l1_test: 256,
    // scroll_l2_test: 256,
    // orbiter: 256,
    // taiko_a1_test: 256,
};
function getMaxBits(chainId: number) {
    return MAX_BITS[chainId] || 256;
}
export const SIZE_OP = {
    P_NUMBER: 4,
};

function isLimitNumber(chain: string | number) {
    if (chain === 3 || chain === 33 || chain === "zksync") {
        return true;
    }
    if (chain === 8 || chain === 88 || chain === "immutablex") {
        return true;
    }
    if (chain === 11 || chain === 511 || chain === "dydx") {
        return true;
    }
    if (chain === 12 || chain === 512 || chain === "zkspace") {
        return true;
    }
    return false;
}

function isLPChain(chain: string | number) {
    if (chain === 9 || chain === 99 || chain === "loopring") {
        return true;
    }
    return false;
}

function getToAmountFromUserAmount(
    userAmount: any,
    fromDecimals: number,
    tradingFee: number,
    gasRate: number,
    isWei: any,
) {
    let toAmount_tradingFee = new BigNumber(userAmount).minus(
        new BigNumber(tradingFee),
    );
    const gasFee = toAmount_tradingFee
        .multipliedBy(new BigNumber(gasRate))
        .dividedBy(new BigNumber(1000));
    const digit = fromDecimals === 18 ? 5 : 2;
    // accessLogger.info('digit =', digit)
    let gasFee_fix = gasFee.decimalPlaces(digit, BigNumber.ROUND_UP);
    // accessLogger.info('gasFee_fix =', gasFee_fix.toString())
    let toAmount_fee = toAmount_tradingFee.minus(gasFee_fix);
    // accessLogger.info('toAmount_fee =', toAmount_fee.toString())
    if (!toAmount_fee || isNaN(Number(toAmount_fee))) {
        return 0;
    }
    if (isWei) {
        return toAmount_fee.multipliedBy(
            new BigNumber(10 ** fromDecimals),
        );
    } else {
        return toAmount_fee;
    }
}
function getTAmountFromRAmount(
    chain: number,
    amount: string,
    pText: string,
) {
    // if (!isChainSupport(chain)) {
    //     return {
    //         state: false,
    //         error: "The chain did not support",
    //     };
    // }
    if (Number(amount) < 1) {
        return {
            state: false,
            error: "the token doesn't support that many decimal digits",
        };
    }
    if (pText.length > SIZE_OP.P_NUMBER) {
        return {
            state: false,
            error: "the pText size invalid",
        };
    }

    const validDigit = AmountValidDigits(chain, amount); // 10 11
    const amountLength = amount.toString().length;
    if (amountLength < SIZE_OP.P_NUMBER) {
        return {
            state: false,
            error: "Amount size must be greater than pNumberSize",
        };
    }
    if (isLimitNumber(chain) && amountLength > validDigit) {
        const tAmount =
            amount.toString().slice(0, validDigit - pText.length) +
            pText +
            amount.toString().slice(validDigit);
        return {
            state: true,
            tAmount: tAmount,
        };
    } else if (isLPChain(chain)) {
        return {
            state: true,
            tAmount: amount + "",
        };
    } else {
        const tAmount =
            amount.toString().slice(0, amountLength - pText.length) + pText;
        return {
            state: true,
            tAmount: tAmount,
        };
    }
}

function getPTextFromTAmount(chain: number, amount: string) {
    // if (!isChainSupport(chain)) {
    //     return {
    //         state: false,
    //         error: "The chain did not support",
    //     };
    // }
    if (Number(amount) < 1) {
        return {
            state: false,
            error: "the token doesn't support that many decimal digits",
        };
    }
    amount = new BigNumber(String(amount)).toFixed();
    //Get the effective number of digits
    const validDigit = AmountValidDigits(chain, amount); // 10 11
    const amountLength = amount.toString().length;
    if (amountLength < SIZE_OP.P_NUMBER) {
        return {
            state: false,
            error: "Amount size must be greater than pNumberSize",
        };
    }
    if (isLimitNumber(chain) && amountLength > validDigit) {
        const zkAmount = amount.toString().slice(0, validDigit);
        const op_text = zkAmount.slice(-SIZE_OP.P_NUMBER);
        return {
            state: true,
            pText: op_text,
        };
    } else {
        const op_text = amount.toString().slice(-SIZE_OP.P_NUMBER);
        return {
            state: true,
            pText: op_text,
        };
    }
}
function getRAmountFromTAmount(chain: number, amount: string) {
    let pText = "";
    for (let index = 0; index < SIZE_OP.P_NUMBER; index++) {
        pText = pText + "0";
    }
    // if (!isChainSupport(chain)) {
    //     return {
    //         state: false,
    //         error: "The chain did not support",
    //     };
    // }
    if (Number(amount) < 1) {
        return {
            state: false,
            error: "the token doesn't support that many decimal digits",
        };
    }

    const validDigit = AmountValidDigits(chain, amount); // 10 11
    const amountLength = amount.toString().length;
    if (amountLength < SIZE_OP.P_NUMBER) {
        return {
            state: false,
            error: "Amount size must be greater than pNumberSize",
        };
    }
    if (isLimitNumber(chain) && amountLength > validDigit) {
        const rAmount =
            amount.toString().slice(0, validDigit - SIZE_OP.P_NUMBER) +
            pText +
            amount.toString().slice(validDigit);
        return {
            state: true,
            rAmount: rAmount,
        };
    } else {
        const rAmount =
            amount.toString().slice(0, amountLength - SIZE_OP.P_NUMBER) + pText;
        return {
            state: true,
            rAmount: rAmount,
        };
    }
}

// function isChainSupport(chain: string | number) {
//     if (CHAIN_INDEX[chain] && MAX_BITS[CHAIN_INDEX[chain]]) {
//         return true;
//     }
//     return false;
// }

/**
 * 0 ~ (2 ** N - 1)
 * @param { any } chain
 * @returns { any }
 */
function AmountRegion(chainId: number): any {
    // if (!isChainSupport(chain)) {
    //     return {
    //         error: "The chain did not support",
    //     };
    // }
    const max = new BigNumber(2 ** getMaxBits(chainId) - 1);
    return {
        min: new BigNumber(0),
        max: max,
    };
}

function AmountMaxDigits(chain: number) {
    const amountRegion = AmountRegion(chain);
    if (amountRegion?.error) {
        return amountRegion;
    }
    return amountRegion.max.toFixed().length;
}

function AmountValidDigits(chain: number, amount: string) {
    const amountMaxDigits = AmountMaxDigits(chain);
    if (amountMaxDigits.error) {
        return amountMaxDigits.error;
    }
    const amountRegion = AmountRegion(chain);

    const ramount = removeSidesZero(amount.toString());
    if (ramount.length > amountMaxDigits) {
        return "amount is inValid";
    }
    //note:the compare is one by one,not all by all
    if (ramount > amountRegion.max.toFixed()) {
        return amountMaxDigits - 1;
    } else {
        return amountMaxDigits;
    }
}

function removeSidesZero(param: string) {
    if (typeof param !== "string") {
        return "param must be string";
    }
    return param.replace(/^0+(\d)|(\d)0+$/gm, "$1$2");
}

function isAmountInRegion(amount: BigNumber.Value, chain: number) {
    // if (!isChainSupport(chain)) {
    //     return {
    //         state: false,
    //         error: "The chain did not support",
    //     };
    // }
    const amountRegion = AmountRegion(chain);
    if (amountRegion.error) {
        return false;
    }
    if (
        new BigNumber(amount).gte(amountRegion.min) &&
        new BigNumber(amount).lte(amountRegion.max)
    ) {
        return true;
    }
    return false;
}

function pTextFormatZero(num: string) {
    if (String(num).length > SIZE_OP.P_NUMBER) return num;
    return (Array(SIZE_OP.P_NUMBER).join("0") + num).slice(-SIZE_OP.P_NUMBER);
}

/**
 * Get return amount
 * @param fromChainID
 * @param toChainID
 * @param amountStr
 * @param market
 * @param nonce
 * @returns
 */
export function getAmountToSend(
    fromChainID: number,
    fromDecimals: number,
    tradingFee: number,
    gas: number,
    toChainID: number,
    amountStr: string,
    nonce: string | number,
) {
    const realAmount = getRAmountFromTAmount(fromChainID, amountStr);
    if (!realAmount.state) {
        console.error(realAmount.error);
        return;
    }
    let rAmount = <any>realAmount.rAmount;
    if (nonce > 8999) {
        console.error("nonce too high, not allowed");
        return;
    }
    if (toChainID === 3) {
        var prefix = rAmount.substr(0, 11);
        rAmount = `${prefix}${"0".repeat(rAmount.length - prefix.length)}`;
    }
    const nonceStr = pTextFormatZero(String(nonce));
    const readyAmount = getToAmountFromUserAmount(
        new BigNumber(rAmount).dividedBy(
            new BigNumber(10 ** fromDecimals),
        ),
        fromDecimals,
        tradingFee,
        gas,
        true,
    );
    return getTAmountFromRAmount(toChainID, readyAmount.toFixed(), nonceStr);
}
/**
 * @param chainId
 * @param amount
 * @returns
 */
function getAmountFlag(chainId: number, amount: string): string {
    const rst = getPTextFromTAmount(chainId, amount);
    if (!rst.state) {
        return "0";
    }
    return (Number(rst.pText) % 9000) + "";
}

export {
    getPTextFromTAmount,
    getAmountFlag
};
