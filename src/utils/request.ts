import { stringify } from "qs";
// import axios from "axios";
import fetch from "cross-fetch";
export function HttpGet(url: string, params?: any, headers = {}): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const AbortController = globalThis.AbortController;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 1000 * 60);
    if (params) {
      url = `${url}${url.includes("?") ? "&" : "?"}${stringify({
        ...params,
      })}`;
    }
    try {
      const response = await fetch(url, {
        headers: headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      resolve(response.json());
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
export function HttpPost(
  url: string,
  data: any = {},
  headers = {},
): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const AbortController = globalThis.AbortController;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 1000 * 60);
    try {
      const response = await fetch(url, {
        method: "post",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...headers,
        },
        //make sure to serialize your JSON body
        body: JSON.stringify(data),
      });
      clearTimeout(timeout);
      resolve(response.json());
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
