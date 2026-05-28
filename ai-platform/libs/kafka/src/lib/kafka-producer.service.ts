import { IKafkaMessage, IKafkaModuleConfig } from '@ai-platform/shared';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Partitioners, type Producer } from 'kafkajs';
import { KAFKA_MODULE_CONFIG } from './kafka.constants';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private producer!: Producer;

  constructor(
    @Inject(KAFKA_MODULE_CONFIG)
    private readonly config: IKafkaModuleConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    const kafka = new Kafka({
      clientId: `${this.config.clientId}-producer`,
      brokers: this.config.brokers,
    });
    this.producer = kafka.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
    });
    await this.producer.connect();
  }

  async publish<T>(topic: string, message: IKafkaMessage<T>): Promise<void> {
    await this.producer.send({
      topic,
      messages: [
        {
          key: message.key,
          value: JSON.stringify(message.value),
        },
      ],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer?.disconnect();
  }
}
