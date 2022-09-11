export type ForwardAssetEvent = {
  type: "forwardAsset";
  path: string;
  text: string;
  contentType: string;
  status: any; // TBD
};

export type WorkerErrorEvent = {
  error: string;
  type: "error";
};

export type LogEvent = {
  type: "log";
  line: string;
};

export type OtherEvent = {
  type: "other";
  contentType: string;
  text: string;
};

export type FromWebWorkerEvent =
  | WorkerErrorEvent
  | ForwardAssetEvent
  | LogEvent
  | OtherEvent;
