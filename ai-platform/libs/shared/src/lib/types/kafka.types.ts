export interface IKafkaMessage<T> {
  topic: string;
  key?: string;
  value: T;
  timestamp?: string;
}

export interface IKafkaModuleConfig {
  clientId: string;
  brokers: string[];
  groupId: string;
}

export type KafkaMessageHandler<T = unknown> = (message: IKafkaMessage<T>) => Promise<void> | void;
