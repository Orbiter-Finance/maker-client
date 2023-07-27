import { groupBy, padStart, uniqBy,clone } from "lodash";
import JSONbig from 'json-bigint';
export function JSONStringify(data:any) {
  return JSONbig.stringify(data);
}
export async function sleep(ms: number) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(null);
    }, ms);
  });
}
export function equals<T, U extends T>(val1: T, val2: U, ignoreCase = true) {
  if (val1 === val2) {
    return true;
  }
  if (ignoreCase && String(val1).toLowerCase() === String(val2).toLowerCase()) {
    return true;
  }
  return false;
}

export function oldMarketConvertScanChainConfig(makerList: Array<any>) {
  const c1List = uniqBy(
    makerList,
    (row: { c1ID: string; makerAddress: string }) => {
      return row.c1ID + row.makerAddress;
    },
  ).map((row: { c1ID: string; makerAddress: string }) => {
    return {
      intranetId: row.c1ID,
      address: row.makerAddress,
    };
  });
  const c2List = uniqBy(
    makerList,
    (row: { c2ID: string; makerAddress: string }) => {
      return row.c2ID + row.makerAddress;
    },
  ).map((row: { c2ID: string; makerAddress: string }) => {
    return {
      intranetId: row.c2ID,
      address: row.makerAddress,
    };
  });
  const result = uniqBy(
    [...c1List, ...c2List],
    (row: { intranetId: string; address: string }) => {
      return row.intranetId + row.address;
    },
  );
  return groupBy(result, "intranetId");
}
export function fix0xPadStartAddress(address: string, length: number) {
  address = address.replace("0x", "");
  if (address.length < length) {
    return `0x${padStart(address, length - 2, "0")}`;
  }
  return address;
}
export function isObject(obj: any) {
  if (Buffer.isBuffer(obj)) {
    return false;
  }
  return toString.call(obj) === "[object Object]";
}
export function isString(obj: any) {
  return toString.call(obj) === "[object String]";
}
export function isFunction(obj: any) {
  return typeof obj === "function";
}
const numberReg =
  /^((\-?\d*\.?\d*(?:e[+-]?\d*(?:\d?\.?|\.?\d?)\d*)?)|(0[0-7]+)|(0x[0-9a-f]+))$/i;
export function isNumberString(obj: any) {
  return numberReg.test(obj);
}
export function isNumber(obj: any) {
  return toString.call(obj) === "[object Number]";
}
export function isBoolean(obj: any) {
  return toString.call(obj) === "[object Boolean]";
}
export function isEmpty(obj: any) {
  if (isObject(obj)) {
    let key;
    for (key in obj) {
      return false;
    }
    return true;
  } else if (Array.isArray(obj)) {
    return obj.length === 0;
  } else if (isString(obj)) {
    return obj.length === 0;
  } else if (isNumber(obj)) {
    return obj === 0;
  } else if (obj === null || obj === undefined) {
    return true;
  } else if (isBoolean(obj)) {
    return !obj;
  }
  return false;
}
export {
  groupBy,
  orderBy,
  maxBy,
  uniqBy,
  padStart,
  flatten,
  uniq,
  clone,
  cloneDeep
} from "lodash";