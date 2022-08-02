/**
 * Insert fake data into CosmosDB database emulator.
 */
// tslint:disable: no-submodule-imports object-literal-sort-keys no-let
import * as dotenv from "dotenv";
dotenv.config();

import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel,
  Profile,
  NewProfile,
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel,
  Service,
  NewService,
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel,
  NewMessageWithoutContent,
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel,
  MessageStatus,
  NewMessageStatus,
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel,
  NewNotification,
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel,
  NotificationStatus,
  NewNotificationStatus,
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { getRequiredStringEnv } from "@pagopa/io-functions-commons/dist/src/utils/env";
import * as PR from "io-ts/PathReporter";

import * as ulid from "ulid";
import * as faker from "faker";
import * as randomstring from "randomstring";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { NotificationChannelStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";

import { BlobServiceClient, ContainerCreateIfNotExistsResponse } from "@azure/storage-blob";
import { QueueServiceClient, QueueCreateIfNotExistsResponse } from "@azure/storage-queue";
import { TableServiceClient } from "@azure/data-tables";
import { createBlobService } from "azure-storage";
import { CosmosClient, DatabaseResponse, ContainerResponse } from "@azure/cosmos";
import { pipe } from "fp-ts/lib/function";
import { NewMessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessageContent";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/SpecialServiceCategory";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";

const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const dbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: cosmosDbKey
})

const dbInstance = dbClient.database(cosmosDbName);

const storageConnectionString = getRequiredStringEnv(
  "STORAGE_CONNECTION_STRING"
);

const blobService = BlobServiceClient.fromConnectionString(storageConnectionString);
const queueService = QueueServiceClient.fromConnectionString(storageConnectionString);
const tableService = TableServiceClient.fromConnectionString(storageConnectionString, { allowInsecureConnection: true });

/**
 * Generate a fake fiscal code.
 * Avoids collisions with real ones as we use
 * a literal "Y" for the location field.
 */
function generateFakeFiscalCode(): FiscalCode {
  const s = randomstring.generate({
    capitalization: "uppercase",
    charset: "alphabetic",
    length: 6,
  });
  const d = randomstring.generate({
    charset: "numeric",
    length: 7,
  });
  return [s, d[0], d[1], "A", d[2], d[3], "Y", d[4], d[5], d[6], "X"].join(
    ""
  ) as FiscalCode;
}

const createDatabase = (databaseName: string): TE.TaskEither<Error, DatabaseResponse> =>
  TE.tryCatch(
    () =>
      dbClient.databases.createIfNotExists({ id: databaseName }),
    (err) =>
      new Error(`Cannot create database ${databaseName}: ${err}`)
  )

const createCollection = (collectionName: string, partitionKey: string): TE.TaskEither<Error, ContainerResponse> =>
  TE.tryCatch(
    () => dbInstance.containers.createIfNotExists({ id: collectionName, partitionKey: { paths: [`/${partitionKey}`] } }),
    (err) => new Error(`Cannot create ${collectionName} collection: ${err}`)
  )

const serviceCollection = dbInstance.container(SERVICE_COLLECTION_NAME);
const serviceModel = new ServiceModel(serviceCollection);

const getServiceFixture = (s?: Partial<Service>): NewService =>
  pipe(NewService.decode({
    authorizedCIDRs: [],
    authorizedRecipients: [],
    departmentName: faker.random.words(2),
    isVisible: true,
    maxAllowedPaymentAmount: faker.random.number({ min: 1, max: 10000 }),
    organizationFiscalCode: randomstring.generate({
      charset: "numeric",
      length: 11,
    }),
    organizationName: faker.company.companyName(),
    requireSecureChannels: faker.random.boolean(),
    serviceId: ulid.ulid(),
    serviceName: faker.company.bsBuzz(),
    ...s,
  }),
    E.getOrElseW((err) => {
      throw new Error(`Cannot decode service payload: ${PR.failure(err).join("\n")}`)
    })
  )

const profilesCollection = dbInstance.container(PROFILE_COLLECTION_NAME)
const profileModel = new ProfileModel(profilesCollection);

const getProfileFixture = (p?: Partial<Profile>): NewProfile =>
  pipe(NewProfile.decode({
    acceptedTosVersion: faker.random.number(2),
    email: faker.internet.exampleEmail(),
    fiscalCode: generateFakeFiscalCode(),
    isEmailEnabled: faker.random.boolean(),
    isEmailValidated: faker.random.boolean(),
    isInboxEnabled: faker.random.boolean(),
    isWebhookEnabled: faker.random.boolean(),
    blockedInboxOrChannels: {
      [ulid.ulid()]: [faker.random.arrayElement(["WEBHOOK", "EMAIL"])],
    },
    ...p,
  }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode profile payload: ${PR.failure(err).join("\n")}`)
    })
  )

const messageCollection = dbInstance.container(MESSAGE_COLLECTION_NAME)
const messageModel = new MessageModel(
  messageCollection,
  // tslint:disable-next-line: no-any
  "message-content" as any
);

const getMessageFixture = (
  m: Partial<NewMessageWithoutContent>
): NewMessageWithoutContent =>
  pipe(
    NewMessageWithoutContent.decode({
      id: ulid.ulid(),
      indexedId: ulid.ulid(),
      fiscalCode: generateFakeFiscalCode(),
      createdAt: faker.date.past(),
      senderServiceId: faker.random.word() as NewMessageWithoutContent["senderServiceId"],
      senderUserId: faker.random.word() as NewMessageWithoutContent["senderUserId"],
      isPending: faker.random.boolean(),
      timeToLiveSeconds: faker.random.number({
        min: 3600,
        max: 10000,
      }) as NewMessageWithoutContent["timeToLiveSeconds"],
      ...m,
    }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode profile payload: ${PR.failure(err).join("\n")}`)
    })
  )

const messageStatusCollection = dbInstance.container(MESSAGE_STATUS_COLLECTION_NAME)
const messageStatusModel = new MessageStatusModel(
  messageStatusCollection
);

const getMessageStatusFixture = (ms?: Partial<MessageStatus>): NewMessageStatus =>
  pipe(
    NewMessageStatus.decode({
      messageId: ulid.ulid(),
      status: faker.random.arrayElement([
        MessageStatusValueEnum.ACCEPTED,
        MessageStatusValueEnum.FAILED,
        MessageStatusValueEnum.PROCESSED,
        MessageStatusValueEnum.REJECTED,
        MessageStatusValueEnum.THROTTLED,
      ]),
      updatedAt: faker.date.past(),
      ...ms,
    }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode message status payload: ${PR.failure(err).join("\n")}`)
    })
  )

const notificationCollection = dbInstance.container(NOTIFICATION_COLLECTION_NAME)
const notificationModel = new NotificationModel(
  notificationCollection
);

const getNotificationFixture = (
  n?: Partial<NewNotification>
): NewNotification =>
  pipe(
    NewNotification.decode({
      id: ulid.ulid(),
      fiscalCode: generateFakeFiscalCode(),
      messageId: ulid.ulid(),
      channels: {
        EMAIL: {
          addressSource: "PROFILE_ADDRESS",
          toAddress: faker.internet.exampleEmail(),
        },
        WEBHOOK: {
          url: "https://app-backend.io.italia.it/api/v1/notify?token=secret",
        },
      },
      ...n,
    }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode notification payload: ${PR.failure(err).join("\n")}`)
    })
  )

const notificationStatusCollection = dbInstance.container(NOTIFICATION_STATUS_COLLECTION_NAME)
const notificationStatusModel = new NotificationStatusModel(
  notificationStatusCollection
);

const getNotificationStatusFixture = (
  n?: Partial<NotificationStatus>
): NewNotificationStatus =>
  pipe(
    NewNotificationStatus.decode({
      statusId: ulid.ulid(),
      messageId: ulid.ulid(),
      updatedAt: faker.date.past(),
      status: faker.random.arrayElement([
        NotificationChannelStatusValueEnum.EXPIRED,
        NotificationChannelStatusValueEnum.FAILED,
        NotificationChannelStatusValueEnum.THROTTLED,
        NotificationChannelStatusValueEnum.SENT,
      ]),
      channel: faker.random.arrayElement(["EMAIL", "WEBHOOK"]),
      ...n,
    }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode notification status payload: ${PR.failure(err).join("\n")}`)
    })
  )

const generateServiceFixtures = async (s?: Partial<Service>) => {
  const aService = getServiceFixture(s);

  // create a new version
  await pipe(
    serviceModel.create(
      aService
    ),
    TE.mapLeft(() => {
      throw new Error("cannot create new service");
    }),
    TE.map(service => serviceModel.update(
      service
    ))
  )()
};

const generateMessageContentFixture = (): NewMessageContent => {
  return pipe(NewMessageContent.decode({
    markdown: faker.lorem.words(100),
    subject: faker.lorem.words(5)
  }),
    E.getOrElseW(() => {
      throw new Error("Cannot generate message content payload")
    })
  )
};

/**
  * @deprecated
*/
const createOldBlobService = (storageConnectionString: string) => createBlobService(storageConnectionString);

const generateMessageFixtures = async (fiscalCode: FiscalCode) => {
  const aMessage = getMessageFixture({
    fiscalCode
  });

  await pipe(
    messageModel.create(aMessage),
    TE.chainW(() => {
      /*
        NOTICE: io-functions-commons is using a deprecated version for the blob storage.
                here i will use the deprecated library client just to let it works
      */
      return messageModel.storeContentAsBlob(
        createOldBlobService(storageConnectionString),
        aMessage.id,
        generateMessageContentFixture()
      )
    }),
    TE.chainW(() => {
      const aMessageStatus = getMessageStatusFixture({ messageId: aMessage.id });

      return messageStatusModel.create(
        aMessageStatus
      )
    }),
    //create a new version
    TE.chainW(createdMessageStatus =>
      messageStatusModel.update(
        createdMessageStatus
      )
    ),
    TE.bindW("aNotification", () => TE.of(getNotificationFixture({ messageId: aMessage.id, fiscalCode: aMessage.fiscalCode }))),
    TE.chainFirstW(({ aNotification }) => notificationModel.create(aNotification)),
    TE.bindW("aNotificationStatus", ({ aNotification }) => TE.of(getNotificationStatusFixture({ messageId: aMessage.id, notificationId: aNotification.id }))),
    TE.bindW("createdNotificationStatus", ({ aNotificationStatus }) => notificationStatusModel.create(aNotificationStatus)),
    TE.mapLeft((err) => {
      throw new Error("Cannot create new notification status" + err);
    }),
    TE.chainFirstW(({ createdNotificationStatus }) => notificationStatusModel.update(createdNotificationStatus))
  )()

  return aMessage.id
};

const generateUserFixtures = async () => {
  const aProfile = getProfileFixture();
  await pipe(
    profileModel.create(aProfile),
    TE.mapLeft(() => {
      throw new Error("Cannot create profile");
    }),
  )()

  return aProfile.fiscalCode;
};

const generateUserMessageFixtures = async () => {
  for (let nusers = 0; nusers < 10; nusers++) {
    const fiscalCode = await generateUserFixtures();
    for (let nmessages = 0; nmessages < 10; nmessages++) {
      await generateMessageFixtures(fiscalCode);
    }
  }
};

const createContainer = (containerName: string): TE.TaskEither<Error, ContainerCreateIfNotExistsResponse> =>
  TE.tryCatch(
    () => blobService.getContainerClient(containerName).createIfNotExists(),
    (err) => new Error(`Could not create container: ${err}`)
  )

const createQueue = (queueName: string): TE.TaskEither<Error, QueueCreateIfNotExistsResponse> =>
  TE.tryCatch(
    () => queueService.getQueueClient(queueName).createIfNotExists(),
    (err) => new Error(`Could not create queue: ${err}`)
  )

// TODO: search if createTable method rejects if the table already exists
const createTable = (tableName: string): TE.TaskEither<Error, void> =>
  TE.tryCatch(
    () => tableService.createTable(tableName),
    (err) => new Error(`Could not create table: ${err}`)
  )

const collectionOperationsArray = [
  createCollection("message-status", "messageId"),
  createCollection("messages", "fiscalCode"),
  createCollection("notification-status", "notificationId"),
  createCollection("notifications", "messageId"),
  createCollection("profiles", "fiscalCode"),
  createCollection("services", "serviceId"),
  createCollection("user-data-processing", "fiscalCode"),

  createCollection("bonus-activations", "id"),
  createCollection("bonus-leases", "id"),
  createCollection("bonus-processing", "id"),
  createCollection("eligibility-checks", "id"),
  createCollection("user-bonuses", "fiscalCode"),

  createCollection("user-cgns", "fiscalCode"),
  createCollection("user-eyca-cards", "fiscalCode"),
  createCollection("activations", "fiscalCode")
]

const containerOperationsArray = [
  createContainer("spidassertions"),

  createContainer("cached"),
  createContainer("message-content"),

  createContainer("user-data-download"),
  createContainer("user-data-backup"),

  createContainer("$web"),
  createContainer("services"),
]

const queueOperationsArray = [
  createQueue("spidmsgitems"),
  createQueue("push-notifications"),
  createQueue("bonusactivations"),
  createQueue("redeemed-bonuses"),
  createQueue("eycaactivations"),
]

const tableOperationsArray = [
  createTable("SubscriptionsFeedByDay"),
  createTable("ValidationTokens"),

  createTable("adelogs"),
  createTable("inpslogs"),
  createTable("bonusactivations"),
  createTable("bonusleasebindings"),
  createTable("eligibilitychecks"),
  createTable("redeemederrors"),

  createTable("cgnleasebindings"),
  createTable("cgnexpirations"),
]

//MAIN PIPE
pipe(
  createDatabase(cosmosDbName),
  TE.chain(() => TE.sequenceArray(collectionOperationsArray)),
  TE.map(() =>
    pipe(
      NonEmptyString.decode(process.env.REQ_SERVICE_ID),
      E.fold(
        () => generateServiceFixtures(),
        (serviceId) => generateServiceFixtures({ serviceId })
      )
    )
  ),
  TE.map(() =>
    pipe(
      NonEmptyString.decode(process.env.REQ_SPECIAL_SERVICE_ID),
      E.fold(
        () => generateServiceFixtures(),
        (serviceId) => generateServiceFixtures({ serviceId, serviceMetadata: { scope: ServiceScopeEnum.NATIONAL, category: SpecialServiceCategoryEnum.SPECIAL } })
      )
    )
  ),
  TE.chain(() => TE.sequenceArray(containerOperationsArray)),
  TE.chain(() => TE.sequenceArray(queueOperationsArray)),
  TE.chain(() => TE.sequenceArray(tableOperationsArray)),
  TE.mapLeft((err) => {
    // tslint:disable-next-line: no-console
    console.error(err)
  }),
  TE.fold(() => process.exit(1), () => generateUserMessageFixtures),
)()
