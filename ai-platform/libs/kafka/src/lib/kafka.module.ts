import { IKafkaModuleConfig } from '@ai-platform/shared';
import { DynamicModule, Module } from '@nestjs/common';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaProducerService } from './kafka-producer.service';
import { KAFKA_MODULE_CONFIG } from './kafka.constants';

@Module({})
export class KafkaModule {
  static forRoot(config: IKafkaModuleConfig): DynamicModule {
    return {
      module: KafkaModule,
      global: true,
      providers: [
        {
          provide: KAFKA_MODULE_CONFIG,
          useValue: config,
        },
        KafkaProducerService,
        KafkaConsumerService,
      ],
      exports: [KafkaProducerService, KafkaConsumerService],
    };
  }
}
