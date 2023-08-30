import { template } from "lodash";
import { HttpGet } from "../utils/request";
const config = {
  endpoint: "https://utf8api.smschinese.cn/",
  uid: "zu19890223",
};
export enum SMSTemplate {
  SendTransactionError = "Send transaction error: chain=<%= chain %>, msg=<%= msg %>",
}
export class SMSService {
  constructor() {}

  async sendAlert(templateId: keyof typeof SMSTemplate, params: any = {}) {
    const compiled = template(SMSTemplate[templateId]);
    const smsText = compiled(params);
    const Key = process.env.sms_key;
    const smsMob = process.env.sms_numbers;
    if (!Key || !smsMob) {
      console.error(
        "Missing configuration for sending short message notification"
      );
      return;
    }
    const query = {
      Uid: config.uid,
      Key,
      smsMob,
      smsText,
    };
    const rest = await HttpGet(config.endpoint, query);
    console.info(`SMS Send Alert:${smsText}`);
    return rest;
  }
}
