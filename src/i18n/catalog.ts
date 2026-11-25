import type { ICUArgs } from "next-intl";
import type french from "../../messages/fr";

type SourceMessages = typeof french;

/** Require every source key while allowing each language to supply its own text. */
export type MessageCatalog = {
  readonly [Namespace in keyof SourceMessages]: {
    readonly [Key in keyof SourceMessages[Namespace]]: string;
  };
};

type Arguments<Message extends string> = ICUArgs<
  Message,
  {
    ICUArgument: string;
    ICUNumberArgument: number | bigint;
    ICUDateArgument: Date;
  }
>;

/** Reject translated messages whose ICU argument names or types differ from the source. */
export type CompatibleMessageCatalog<Catalog extends MessageCatalog> = {
  readonly [Namespace in keyof SourceMessages]: {
    readonly [Key in keyof SourceMessages[Namespace] &
      keyof Catalog[Namespace]]: Arguments<
      Extract<SourceMessages[Namespace][Key], string>
    > extends Arguments<Extract<Catalog[Namespace][Key], string>>
      ? Arguments<Extract<Catalog[Namespace][Key], string>> extends Arguments<
          Extract<SourceMessages[Namespace][Key], string>
        >
        ? string
        : never
      : never;
  };
};
