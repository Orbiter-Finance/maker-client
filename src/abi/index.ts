import fs from "fs";
import path from "path";
import("../abi/ERC20Abi.json");
import("../abi/OrbiterXRouter.json");
import("../abi/OBSource.json");
import("../abi/ChainLinkAggregatorV3.json");
import("../abi/starknet-erc20.json");
import("../abi/starknet-account.json");
const abis: any = {};
function loadJsonFiles(directoryPath) {
  const files = fs.readdirSync(directoryPath);
  files.forEach(async (file) => {
    const filePath = path.join(directoryPath, file);
    const fileName = path.parse(file).name;
    if (path.extname(file) === ".json") {
      const fileContent = fs.readFileSync(filePath, "utf8");
      abis[fileName] = JSON.parse(fileContent);
    }
  });
  return abis;
}
export default loadJsonFiles(__dirname);
