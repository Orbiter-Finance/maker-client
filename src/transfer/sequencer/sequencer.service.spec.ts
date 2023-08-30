import { Test, type TestingModule } from "@nestjs/testing";
import { SequencerService } from "./sequencer.service";

describe("SequencerService", () => {
  let service: SequencerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SequencerService],
    }).compile();

    service = module.get<SequencerService>(SequencerService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
