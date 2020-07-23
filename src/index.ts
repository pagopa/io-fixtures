/**
 * Insert fake data into CosmosDB database emulator.
 */
// tslint:disable: no-submodule-imports object-literal-sort-keys no-let
import * as dotenv from "dotenv";
dotenv.config();

import {
  CollectionMeta,
  DocumentClient as DocumentDBClient,
  UriFactory,
} from "documentdb";
import { Either, left, right } from "fp-ts/lib/Either";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel,
  Profile,
} from "io-functions-commons/dist/src/models/profile";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel,
  Service,
} from "io-functions-commons/dist/src/models/service";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel,
  NewMessageWithoutContent,
} from "io-functions-commons/dist/src/models/message";
import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel,
  MessageStatus,
} from "io-functions-commons/dist/src/models/message_status";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel,
  NewNotification,
} from "io-functions-commons/dist/src/models/notification";
import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel,
  NotificationStatus,
} from "io-functions-commons/dist/src/models/notification_status";
import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { toString } from "fp-ts/lib/function";

import * as ulid from "ulid";
import * as faker from "faker";
import * as randomstring from "randomstring";

import { FiscalCode } from "io-functions-commons/dist/generated/definitions/FiscalCode";
import { MessageStatusValueEnum } from "io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { NotificationChannelStatusValueEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";

import { createBlobService } from "azure-storage";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";

const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);

const documentClient = new DocumentDBClient(cosmosDbUri, {
  masterKey: cosmosDbKey,
});

const storageConnectionString = getRequiredStringEnv(
  "STORAGE_CONNECTION_STRING"
);
const blobService = createBlobService(storageConnectionString);

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

function createDatabase(databaseName: string): Promise<Either<Error, void>> {
  return new Promise((resolve) => {
    documentClient.createDatabase({ id: databaseName }, (err, _) => {
      if (err) {
        return resolve(left<Error, void>(new Error(err.body)));
      }
      resolve(right<Error, void>(void 0));
    });
  });
}

function createCollection(
  collectionName: string,
  partitionKey: string
): Promise<Either<Error, CollectionMeta>> {
  return new Promise((resolve) => {
    const dbUri = UriFactory.createDatabaseUri(cosmosDbName);
    documentClient.createCollection(
      dbUri,
      {
        id: collectionName,
        partitionKey: {
          kind: "Hash",
          paths: [`/${partitionKey}`],
        },
      },
      (err, ret) => {
        if (err) {
          return resolve(left<Error, CollectionMeta>(new Error(err.body)));
        }
        resolve(right<Error, CollectionMeta>(ret));
      }
    );
  });
}

const servicesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  SERVICE_COLLECTION_NAME
);
const serviceModel = new ServiceModel(documentClient, servicesCollectionUrl);

const getServiceFixture = (s?: Partial<Service>): Service =>
  Service.decode({
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
  } as Service).getOrElseL((err) => {
    throw new Error("Cannot decode service payload:" + toString(err));
  });

const profilesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  PROFILE_COLLECTION_NAME
);
const profileModel = new ProfileModel(documentClient, profilesCollectionUrl);

const getProfileFixture = (p?: Partial<Profile>): Profile =>
  Profile.decode({
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
  } as Profile).getOrElseL((err) => {
    throw new Error("Cannot decode profile payload:" + toString(err));
  });

const messageCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  MESSAGE_COLLECTION_NAME
);
const messageModel = new MessageModel(
  documentClient,
  messageCollectionUrl,
  // tslint:disable-next-line: no-any
  "message-content" as any
);

const getMessageFixture = (
  m: Partial<NewMessageWithoutContent>
): NewMessageWithoutContent =>
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
  } as NewMessageWithoutContent).getOrElseL((err) => {
    throw new Error("Cannot decode message payload:" + toString(err));
  });

const messageStatusCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  MESSAGE_STATUS_COLLECTION_NAME
);
const messageStatusModel = new MessageStatusModel(
  documentClient,
  messageStatusCollectionUrl
);

const getMessageStatusFixture = (ms?: Partial<MessageStatus>): MessageStatus =>
  MessageStatus.decode({
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
  } as MessageStatus).getOrElseL((err) => {
    throw new Error("Cannot decode message status payload:" + toString(err));
  });

const notificationCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  NOTIFICATION_COLLECTION_NAME
);
const notificationModel = new NotificationModel(
  documentClient,
  notificationCollectionUrl
);

const getNotificationFixture = (
  n?: Partial<NewNotification>
): NewNotification =>
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
        url: "https://app-backend.io.italia.it/api/v1/notify?token=seceret",
      },
    },
    ...n,
  } as NewNotification).getOrElseL((err) => {
    throw new Error("Cannot decode notification payload:" + toString(err));
  });

const notificationStatusCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  NOTIFICATION_STATUS_COLLECTION_NAME
);
const notificationStatusModel = new NotificationStatusModel(
  documentClient,
  notificationStatusCollectionUrl
);

const getNotificationStatusFixture = (
  n?: Partial<NotificationStatus>
): NotificationStatus =>
  NotificationStatus.decode({
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
  } as NotificationStatus).getOrElseL((err) => {
    throw new Error(
      "Cannot decode notification status payload:" + toString(err)
    );
  });

const generateServiceFixtures = async () => {
  const aService = getServiceFixture();
  const errorOrService = await serviceModel.create(
    aService,
    aService.serviceId
  );
  const createdService = errorOrService.getOrElseL(() => {
    throw new Error("cannot create new service");
  });
  // create a new version
  await serviceModel.update(
    createdService.id,
    createdService.serviceId,
    () => createdService
  );
};

const generateMessageContentFixture = () => {
  return {
    markdown: faker.random.words(10),
    subject: faker.random.words(100),
  } as MessageContent;
};

const generateMessageFixtures = async (fiscalCode: FiscalCode) => {
  const aMessage = getMessageFixture({
    fiscalCode,
  });
  await messageModel.create(aMessage, aMessage.fiscalCode);
  await messageModel.storeContentAsBlob(
    blobService,
    aMessage.id,
    generateMessageContentFixture()
  );

  const aMessageStatus = getMessageStatusFixture({
    messageId: aMessage.id,
  });
  const errorOrMessageStatus = await messageStatusModel.create(
    aMessageStatus,
    aMessageStatus.messageId
  );

  const createdMessageStatus = errorOrMessageStatus.getOrElseL(() => {
    throw new Error("cannot create new message status");
  });
  // create a new version
  await messageStatusModel.update(
    createdMessageStatus.id,
    createdMessageStatus.messageId,
    () => createdMessageStatus
  );

  const aNotification = getNotificationFixture({
    messageId: aMessage.id,
    fiscalCode: aMessage.fiscalCode,
  });
  await notificationModel.create(aNotification, aNotification.messageId);

  const aNotificationStatus = getNotificationStatusFixture({
    messageId: aMessage.id,
    notificationId: aNotification.id,
  });
  const errorOrNotifcationStatus = await notificationStatusModel.create(
    aNotificationStatus,
    aNotificationStatus.notificationId
  );

  const createdNotificationStatus = errorOrNotifcationStatus.getOrElseL(
    (err) => {
      throw new Error("cannot create new notification status:" + toString(err));
    }
  );
  // create a new version
  await notificationStatusModel.update(
    createdNotificationStatus.id,
    createdNotificationStatus.notificationId,
    () => createdNotificationStatus
  );

  return aMessage.id;
};

const generateUserFixtures = async () => {
  const aProfile = getProfileFixture();
  await profileModel.create(aProfile, aProfile.fiscalCode);
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

createDatabase(cosmosDbName)
  .then(() => createCollection("message-status", "messageId"))
  .then(() => createCollection("messages", "fiscalCode"))
  .then(() => createCollection("notification-status", "notificationId"))
  .then(() => createCollection("notifications", "messageId"))
  .then(() => createCollection("profiles", "fiscalCode"))
  .then(() => createCollection("services", "serviceId"))

  .then(() => generateServiceFixtures())

  .then(
    () =>
      new Promise((resolve) =>
        blobService.createContainerIfNotExists("message-content", (err) =>
          // tslint:disable-next-line: no-use-of-empty-return-value no-console
          err ? resolve(console.error(err)) : resolve()
        )
      )
  )

  .then(() => generateUserMessageFixtures())

  // tslint:disable-next-line: no-console
  .catch(console.error);
